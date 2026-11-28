import { createClient } from '@supabase/supabase-js';
import { connectTestDb, type TestDb } from '@speedy/db/testing';
import type { Database } from '@speedy/db/types';
import { memoryStorage } from '@speedy/lib/photos';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanupExpiredJobs, supabaseCleanupStore } from '@/features/cleanup/cleanup';

/**
 * Real tables, fake file storage. Note: this removes EVERY expired anonymous job in the target
 * database, so only run it against a local or CI stack. It needs the database (DATABASE_URL or
 * DB_TESTS) and the REST env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) because the
 * cleanup store and claimJob go through PostgREST; without the REST env it is skipped.
 */
const hasEnv =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) &&
  Boolean(process.env.CI || process.env.DATABASE_URL || process.env.DB_TESTS);

const slug = () => Math.random().toString(36).slice(2).padEnd(20, 'x').slice(0, 20);
const HASH = 'b'.repeat(64);
const DAY = 86_400_000;

describe.skipIf(!hasEnv)('cleanup against the database', () => {
  let db: TestDb;

  beforeAll(async () => {
    const connected = await connectTestDb();
    if (!connected) throw new Error('no test database');
    db = connected;
  });
  afterAll(async () => {
    await db.close();
  });

  async function insertJob(owner: string | null, expires: string | null, logo: string | null) {
    const { rows } = await db.asService((c) =>
      c.query<{ id: string }>(
        `insert into job_photos.jobs (owner_id, share_slug, claim_token_hash, expires_at, logo_path)
         values ($1, $2, $3, $4::timestamptz, $5) returning id`,
        [owner, slug(), HASH, expires, logo],
      ),
    );
    return rows[0]!.id;
  }

  async function insertPhoto(jobId: string, path: string) {
    await db.asService((c) =>
      c.query(
        `insert into job_photos.photos (job_id, kind, storage_path, width, height, position)
         values ($1, 'before', $2, 10, 10, 0)`,
        [jobId, path],
      ),
    );
  }

  const exists = async (id: string) =>
    (await db.asService((c) => c.query('select 1 from job_photos.jobs where id = $1', [id])))
      .rowCount === 1;

  const client = () =>
    createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

  it('deletes only expired anonymous jobs, their photo rows and their files', async () => {
    const owner = await db.createUser();
    const expiredLogo = `jobs/logo-${slug()}.png`;
    const expired = await insertJob(null, new Date(Date.now() - DAY).toISOString(), expiredLogo);
    const fresh = await insertJob(null, new Date(Date.now() + DAY).toISOString(), null);
    const owned = await insertJob(owner.id, null, null);
    const files = memoryStorage();
    await files.put(expiredLogo, new Uint8Array([1]), 'image/png');
    for (const [id, path] of [
      [expired, `jobs/${expired}/before/1.jpg`],
      [fresh, `jobs/${fresh}/before/1.jpg`],
      [owned, `jobs/${owned}/before/1.jpg`],
    ] as const) {
      await insertPhoto(id, path);
      await files.put(path, new Uint8Array([1]), 'image/jpeg');
    }

    const result = await cleanupExpiredJobs({
      store: supabaseCleanupStore(client()),
      storage: files,
    });

    expect(result.failures).toBe(0);
    expect(result.jobsDeleted).toBeGreaterThanOrEqual(1);
    expect(await exists(expired)).toBe(false);
    expect(await exists(fresh)).toBe(true);
    expect(await exists(owned)).toBe(true);
    await expect(files.createSignedUrl(expiredLogo, 60)).rejects.toThrow();
    await expect(files.createSignedUrl(`jobs/${expired}/before/1.jpg`, 60)).rejects.toThrow();
    await expect(files.createSignedUrl(`jobs/${fresh}/before/1.jpg`, 60)).resolves.toBeTypeOf(
      'string',
    );
    await expect(files.createSignedUrl(`jobs/${owned}/before/1.jpg`, 60)).resolves.toBeTypeOf(
      'string',
    );
  });

  it('a retired job can no longer be claimed, and a claimed job can no longer be retired', async () => {
    // Imported here because the module validates env vars when loaded, which a skipped run lacks.
    const { claimJob } = await import('@/features/jobs/server/repo');
    const user = await db.createUser();
    const store = supabaseCleanupStore(client());
    const nowIso = new Date().toISOString();
    const past = new Date(Date.now() - DAY).toISOString();

    const retired = await insertJob(null, past, null);
    expect(await store.retire(retired, nowIso)).toBe(true);
    expect(await store.retire(retired, nowIso)).toBe(true); // a retry after a failed run
    expect(await claimJob(retired, user.id)).toBe(false);

    const claimed = await insertJob(null, past, null);
    expect(await claimJob(claimed, user.id)).toBe(true);
    expect(await store.retire(claimed, nowIso)).toBe(false);
    expect(await store.deleteJob(claimed, nowIso)).toBe(false);
    expect(await exists(claimed)).toBe(true);
  });
});
