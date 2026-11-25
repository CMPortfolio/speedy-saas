import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool, type PoolClient } from 'pg';

/**
 * Database test harness shared by every package and app that tests RLS.
 *
 * Connects to DATABASE_URL (default: the local docker Postgres from `pnpm db:start`), applies
 * the Supabase shim and every migration once per process, then lets tests act as a given user:
 *
 *   const db = await connectTestDb();          // null when no database is reachable
 *   const alice = await db.createUser('a@resend.dev');
 *   await db.as(alice, async (c) => c.query('select * from public.profiles'));
 *
 * `as()` runs the callback inside a transaction with `set local role authenticated` and the
 * JWT claims PostgREST would set, then rolls back, so tests never leak rows into each other.
 */
export const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(here, '..', 'supabase', 'migrations');
export const SHIM_PATH = join(here, 'supabase-shim.sql');

export type Role = 'anon' | 'authenticated' | 'service_role';

export interface TestUser {
  id: string;
  email: string;
}

export interface TestDb {
  pool: Pool;
  /** Insert a row into auth.users and return it. Runs as the superuser. */
  createUser(email?: string): Promise<TestUser>;
  /** Run `fn` as this user (role authenticated) inside a rolled-back transaction. */
  as<T>(user: TestUser | null, fn: (client: PoolClient) => Promise<T>): Promise<T>;
  /** Run `fn` as this user and COMMIT, for fixtures other tests must see. */
  asCommitted<T>(user: TestUser | null, fn: (client: PoolClient) => Promise<T>): Promise<T>;
  /** Run `fn` as the service role (bypasses RLS). */
  asService<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function migrationFiles(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

export async function applyMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(readFileSync(SHIM_PATH, 'utf8'));
    await client.query(`create table if not exists public._speedy_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    const { rows } = await client.query<{ name: string }>(
      'select name from public._speedy_migrations',
    );
    const applied = new Set(rows.map((r) => r.name));
    for (const file of migrationFiles()) {
      const name = file.split('/').pop() ?? file;
      if (applied.has(name)) continue;
      await client.query('begin');
      try {
        await client.query(readFileSync(file, 'utf8'));
        await client.query('insert into public._speedy_migrations (name) values ($1)', [name]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Migration ${name} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
}

async function setRole(client: PoolClient, user: TestUser | null, role: Role): Promise<void> {
  const claims = user
    ? { sub: user.id, role, email: user.email, aud: 'authenticated' }
    : { role, aud: 'anon' };
  await client.query('select set_config($1, $2, true)', [
    'request.jwt.claims',
    JSON.stringify(claims),
  ]);
  await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', user?.id ?? '']);
  await client.query('select set_config($1, $2, true)', ['request.jwt.claim.role', role]);
  await client.query(`set local role ${role}`);
}

let prepared: Promise<Pool | null> | undefined;

async function prepare(): Promise<Pool | null> {
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const pool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 3000 });
  try {
    await pool.query('select 1');
  } catch (e) {
    await pool.end().catch(() => undefined);
    if (process.env.CI)
      throw new Error(`CI requires a database at ${url}: ${(e as Error).message}`);
    console.warn(
      `[db tests] no database at ${url}; skipping (run pnpm --filter @speedy/db db:start).`,
    );
    return null;
  }
  await applyMigrations(pool);
  return pool;
}

export async function connectTestDb(): Promise<TestDb | null> {
  prepared ??= prepare();
  const pool = await prepared;
  if (!pool) return null;

  const run = async <T>(
    user: TestUser | null,
    role: Role,
    fn: (client: PoolClient) => Promise<T>,
    commit: boolean,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await setRole(client, user, role);
      const out = await fn(client);
      await client.query(commit ? 'commit' : 'rollback');
      return out;
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  };

  return {
    pool,
    async createUser(email = `${crypto.randomUUID()}@resend.dev`) {
      const { rows } = await pool.query<{ id: string }>(
        "insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id",
        [email],
      );
      return { id: rows[0]!.id, email };
    },
    as: (user, fn) => run(user, user ? 'authenticated' : 'anon', fn, false),
    asCommitted: (user, fn) => run(user, user ? 'authenticated' : 'anon', fn, true),
    asService: (fn) => run(null, 'service_role', fn, true),
    close: () => pool.end(),
  };
}

/** Postgres error code for an RLS or privilege denial. */
export const INSUFFICIENT_PRIVILEGE = '42501';

export function isDenied(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && (e as { code?: string }).code === INSUFFICIENT_PRIVILEGE
  );
}
