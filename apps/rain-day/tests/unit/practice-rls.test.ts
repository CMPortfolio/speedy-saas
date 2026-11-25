import { connectTestDb, isDenied, type TestDb, type TestUser } from '@speedy/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * rain_day practice tables: an owner reads only their own practice rows and can neither write
 * nor call the server functions; anonymous callers get nothing.
 */
let db: TestDb | null = null;
let alice: TestUser;
let bob: TestUser;
let aliceDay: string;

function freshPhone(): string {
  return `+12395${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
}

const enabled = Boolean(process.env.CI || process.env.DATABASE_URL || process.env.DB_TESTS);
const CREATE =
  'select * from rain_day.create_practice_reschedule($1, $2, $3, $4, $5, $6::jsonb, $7)';

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  alice = await db.createUser();
  bob = await db.createUser();
  const customer = await db.pool.query<{ id: string }>(
    'insert into rain_day.customers (owner_id, name, phone, service_day) values ($1, $2, $3, 2) returning id',
    [alice.id, 'Maria', freshPhone()],
  );
  const made = await db.asService(async (c) =>
    c.query<{ reschedule_id: string }>(CREATE, [
      alice.id,
      crypto.randomUUID(),
      '2026-12-01',
      '2026-12-02',
      'Hi {first_name}',
      JSON.stringify([
        {
          customer_id: customer.rows[0]!.id,
          customer_name: 'Maria',
          body: 'Hi Maria',
          status: 'sent',
          error_code: null,
        },
      ]),
      100,
    ]),
  );
  aliceDay = made.rows[0]!.reschedule_id;
  await db.pool.query(
    'insert into rain_day.practice_opt_outs (owner_id, customer_id) values ($1, $2)',
    [alice.id, customer.rows[0]!.id],
  );
});

afterAll(async () => {
  await db?.close();
});

describe.skipIf(!enabled)('rain_day practice RLS', { timeout: 60_000 }, () => {
  it('an owner reads only their own practice rain days, bubbles and opt-outs', async () => {
    if (!db) return;
    for (const table of ['practice_reschedules', 'practice_messages', 'practice_opt_outs']) {
      const mine = await db.as(alice, (c) => c.query(`select * from rain_day.${table}`));
      expect(mine.rowCount).toBe(1);
      const theirs = await db.as(bob, (c) => c.query(`select * from rain_day.${table}`));
      expect(theirs.rowCount).toBe(0);
    }
  });

  it('owners cannot write, change or delete practice rows', async () => {
    if (!db) return;
    const day = '2026-12-05';
    await expect(
      db.as(alice, (c) =>
        c.query(
          "insert into rain_day.practice_reschedules (owner_id, from_date, to_date, template, idempotency_key) values ($1, $2, '2026-12-06', 'x', gen_random_uuid())",
          [alice.id, day],
        ),
      ),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) =>
        c.query(
          "insert into rain_day.practice_messages (owner_id, practice_reschedule_id, customer_name, direction, body) values ($1, $2, 'x', 'out', 'x')",
          [alice.id, aliceDay],
        ),
      ),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) => c.query("update rain_day.practice_messages set body = 'changed'")),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) => c.query('delete from rain_day.practice_messages')),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) => c.query('delete from rain_day.practice_opt_outs')),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) => c.query("update rain_day.practice_reschedules set template = 'x'")),
    ).rejects.toSatisfy(isDenied);
  });

  it('the rate-limit table and the server functions are closed to owners and anonymous callers', async () => {
    if (!db) return;
    await expect(
      db.as(alice, (c) => c.query('select * from rain_day.practice_actions')),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(null, (c) => c.query('select * from rain_day.practice_messages')),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) =>
        c.query('select rain_day.reserve_practice_action($1, 60, 3600)', [alice.id]),
      ),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) => c.query('select rain_day.clear_practice($1)', [bob.id])),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) =>
        c.query(CREATE, [bob.id, crypto.randomUUID(), '2026-12-01', '2026-12-02', 'x', '[]', 10]),
      ),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) =>
        c.query('select rain_day.add_practice_rows($1, $2, $3, $4, $5::jsonb, false, 10)', [
          bob.id,
          aliceDay,
          aliceDay,
          'x',
          '[]',
        ]),
      ),
    ).rejects.toSatisfy(isDenied);
  });

  it('create_practice_reschedule is once per key, capped, and checks its input', async () => {
    if (!db) return;
    const owner = await db.createUser();
    const c1 = await db.pool.query<{ id: string }>(
      'insert into rain_day.customers (owner_id, name, phone, service_day) values ($1, $2, $3, 2) returning id',
      [owner.id, 'Cap', freshPhone()],
    );
    const rows = (n: number, extra: Record<string, unknown> = {}) =>
      JSON.stringify(
        Array.from({ length: n }, () => ({
          customer_id: c1.rows[0]!.id,
          customer_name: 'Cap',
          body: 'Hi',
          status: 'sent',
          error_code: null,
          ...extra,
        })),
      );
    const key = crypto.randomUUID();
    const make = (k: string, n: number, extra = {}) =>
      db!.asService((c) =>
        c.query(CREATE, [owner.id, k, '2026-12-01', '2026-12-02', 'x', rows(n, extra), 5]),
      );
    const first = await make(key, 3);
    const again = await make(key, 3);
    expect(first.rows[0]).toMatchObject({ created: true });
    expect(again.rows[0]).toEqual({ reschedule_id: first.rows[0].reschedule_id, created: false });
    // 3 bubbles are there; 2 more fit, 3 more do not.
    await expect(make(crypto.randomUUID(), 3)).rejects.toMatchObject({ message: 'practice_full' });
    expect((await make(crypto.randomUUID(), 2)).rows[0]).toMatchObject({ created: true });
    for (const bad of [
      { status: 'delivered' },
      { body: '' },
      { body: 'x'.repeat(481) },
      { error_code: 'whatever' },
    ]) {
      await expect(make(crypto.randomUUID(), 1, bad)).rejects.toMatchObject({ code: '22023' });
    }
  });
});
