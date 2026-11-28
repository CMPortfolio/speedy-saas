import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectTestDb, isDenied, type TestDb, type TestUser } from './harness';

/** Practice mode tables: owner scoped, written by the server only, rate limited. */
let db: TestDb | null = null;
let alice: TestUser;
let bob: TestUser;
let aliceCall: string;
let seq = 0;

async function practiceCall(owner: TestUser, caller = '+12395550101'): Promise<string> {
  const { rows } = await db!.pool.query<{ id: string }>(
    'insert into missed_call.practice_calls (owner_id, caller_number) values ($1, $2) returning id',
    [owner.id, caller],
  );
  await db!.pool.query(
    "insert into missed_call.practice_messages (owner_id, call_id, direction, body) values ($1, $2, 'out', 'hello')",
    [owner.id, rows[0]!.id],
  );
  return rows[0]!.id;
}

const reserve = async (owner: TestUser, ...args: number[]) => {
  const [limit = 60, windowSeconds = 3600, maxMessages = 400, maxCalls = 100] = args;
  const { rows } = await db!.pool.query<{ r: string }>(
    'select missed_call.reserve_practice_action($1, $2, $3, $4, $5) as r',
    [owner.id, limit, windowSeconds, maxMessages, maxCalls],
  );
  return rows[0]!.r;
};

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  alice = await db.createUser();
  bob = await db.createUser();
  aliceCall = await practiceCall(alice);
  await practiceCall(bob, '+12395550102');
});
afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'missed_call practice tables',
  () => {
    it('owners read only their own practice calls and messages', async () => {
      if (!db) return;
      const mine = await db.as(alice, async (c) => ({
        calls: (await c.query('select id from missed_call.practice_calls')).rows,
        messages: (await c.query('select call_id from missed_call.practice_messages')).rows,
      }));
      expect(mine.calls).toEqual([{ id: aliceCall }]);
      expect(mine.messages).toEqual([{ call_id: aliceCall }]);
      const theirs = await db.as(bob, (c) => c.query('select id from missed_call.practice_calls'));
      expect(theirs.rows.map((r) => r.id)).not.toContain(aliceCall);
    });

    it('anon and the action log are closed', async () => {
      if (!db) return;
      await expect(
        db.as(null, (c) => c.query('select * from missed_call.practice_calls')),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(alice, (c) => c.query('select * from missed_call.practice_action_log')),
      ).rejects.toSatisfy(isDenied);
    });

    it('owners cannot write, change or delete practice rows themselves', async () => {
      if (!db) return;
      for (const sql of [
        `insert into missed_call.practice_calls (owner_id, caller_number) values ('${alice.id}', '+12395550150')`,
        `insert into missed_call.practice_messages (owner_id, call_id, direction, body) values ('${alice.id}', '${aliceCall}', 'in', 'x')`,
        `update missed_call.practice_calls set status = 'junk' where id = '${aliceCall}'`,
        `delete from missed_call.practice_calls where id = '${aliceCall}'`,
        `delete from missed_call.practice_messages where call_id = '${aliceCall}'`,
      ]) {
        await expect(db.as(alice, (c) => c.query(sql))).rejects.toSatisfy(isDenied);
      }
    });

    it('only fictional 555-01xx numbers can be practice callers', async () => {
      if (!db) return;
      for (const bad of [
        '+12395550123x',
        '+12395550200',
        '+12395551234',
        '+14165550101',
        '+12395550001',
      ]) {
        await expect(
          db.pool.query(
            'insert into missed_call.practice_calls (owner_id, caller_number) values ($1, $2)',
            [alice.id, bad],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
      for (const good of ['+12395550100', '+12395550199']) {
        await db.pool.query(
          'insert into missed_call.practice_calls (owner_id, caller_number) values ($1, $2)',
          [alice.id, good],
        );
      }
    });

    it('practice rows go with the owner and are separate from real calls', async () => {
      if (!db) return;
      const real = await db.pool.query(
        'select count(*)::int as n from missed_call.calls where caller_number = $1',
        ['+12395550101'],
      );
      expect(real.rows[0]).toEqual({ n: 0 });
    });

    it('reserve_practice_action is service-role only', async () => {
      if (!db) return;
      const call = (c: { query: (q: string, v: unknown[]) => Promise<unknown> }) =>
        c.query('select missed_call.reserve_practice_action($1)', [alice.id]);
      await expect(db.as(alice, call)).rejects.toSatisfy(isDenied);
      await expect(db.as(null, call)).rejects.toSatisfy(isDenied);
    });

    it('allows 60 actions an hour per owner and counts only the window', async () => {
      if (!db) return;
      const owner = await db.createUser();
      for (let i = 0; i < 60; i += 1) expect(await reserve(owner)).toBe('ok');
      expect(await reserve(owner)).toBe('rate_limited');
      await db.pool.query(
        "update missed_call.practice_action_log set created_at = now() - interval '61 minutes' where owner_id = $1",
        [owner.id],
      );
      expect(await reserve(owner)).toBe('ok');
      expect(await reserve(await db.createUser())).toBe('ok');
    });

    it('serialises simultaneous actions so the limit holds', async () => {
      if (!db) return;
      const owner = await db.createUser();
      const results = await Promise.all(Array.from({ length: 12 }, () => reserve(owner, 5)));
      expect(results.filter((r) => r === 'ok')).toHaveLength(5);
      expect(results.filter((r) => r === 'rate_limited')).toHaveLength(7);
    });

    it('says full once the owner has too many practice texts saved, until they clear', async () => {
      if (!db) return;
      const owner = await db.createUser();
      const id = await practiceCall(owner, `+12395550${String(110 + (seq += 1))}`);
      for (let i = 0; i < 4; i += 1) {
        await db.pool.query(
          "insert into missed_call.practice_messages (owner_id, call_id, direction, body) values ($1, $2, 'in', 'x')",
          [owner.id, id],
        );
      }
      expect(await reserve(owner, 60, 3600, 5)).toBe('full');
      expect(await reserve(owner, 60, 3600, 6)).toBe('ok');
      await db.pool.query('delete from missed_call.practice_calls where owner_id = $1', [owner.id]);
      expect(await reserve(owner, 60, 3600, 5)).toBe('ok');
    });

    it('says full once the owner has too many practice calls, even with no texts saved', async () => {
      if (!db) return;
      const owner = await db.createUser();
      for (const n of ['+12395550120', '+12395550121', '+12395550122']) {
        await db.pool.query(
          'insert into missed_call.practice_calls (owner_id, caller_number) values ($1, $2)',
          [owner.id, n],
        );
      }
      expect(await reserve(owner, 60, 3600, 400, 3)).toBe('full');
      expect(await reserve(owner, 60, 3600, 400, 4)).toBe('ok');
    });

    it('a practice message cannot be filed under another owner call', async () => {
      if (!db) return;
      await expect(
        db.pool.query(
          "insert into missed_call.practice_messages (owner_id, call_id, direction, body) values ($1, $2, 'in', 'x')",
          [bob.id, aliceCall],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  },
);
