import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectTestDb, type TestDb, type TestUser, randomUsNumber } from './harness';

/** mark_call: who may use it and when it lifts a junk block. */
let db: TestDb | null = null;
let owner: TestUser;
let other: TestUser;
let lineId: string;
let seq = 0;

async function call(caller: string, status = 'texted'): Promise<string> {
  seq += 1;
  const { rows } = await db!.pool.query<{ id: string }>(
    `insert into missed_call.calls (line_id, caller_number, provider_call_sid, status)
     values ($1, $2, $3, $4) returning id`,
    [lineId, caller, `CA-mark-${crypto.randomUUID()}-${seq}`, status],
  );
  return rows[0]!.id;
}
const mark = (id: string, status: string, who = owner) =>
  db!.asCommitted(who, (c) => c.query('select missed_call.mark_call($1, $2)', [id, status]));
const reasons = async (caller: string) =>
  (
    await db!.pool.query<{ reason: string }>(
      'select reason from missed_call.blocked_numbers where line_id = $1 and number = $2',
      [lineId, caller],
    )
  ).rows.map((r) => r.reason);

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  owner = await db.createUser();
  other = await db.createUser();
  const line = await db.pool.query<{ id: string }>(
    `insert into missed_call.lines (owner_id, provider_number, owner_cell, business_name, template)
     values ($1, $2, '+12395550101', 'Mark Test', 'hi') returning id`,
    [owner.id, randomUsNumber()],
  );
  lineId = line.rows[0]!.id;
});
afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'mark_call',
  () => {
    it('only the line owner can mark a call', async () => {
      if (!db) return;
      const id = await call('+12395550301');
      await expect(mark(id, 'junk', other)).rejects.toMatchObject({ code: 'P0002' });
      expect(await reasons('+12395550301')).toEqual([]);
    });

    it('lifts a junk block when the call that was junk moves on', async () => {
      if (!db) return;
      const id = await call('+12395550302');
      await mark(id, 'junk');
      expect(await reasons('+12395550302')).toEqual(['junk']);
      await mark(id, 'called_back');
      expect(await reasons('+12395550302')).toEqual([]);
    });

    it('keeps the block while another call from the number is still junk', async () => {
      if (!db) return;
      const a = await call('+12395550303');
      const b = await call('+12395550303');
      await mark(a, 'junk');
      await mark(b, 'junk');
      await mark(a, 'booked');
      expect(await reasons('+12395550303')).toEqual(['junk']);
      await mark(b, 'booked');
      expect(await reasons('+12395550303')).toEqual([]);
    });

    it('does not lift a junk block when the call being marked was never junk', async () => {
      if (!db) return;
      const id = await call('+12395550304');
      await db.pool.query(
        "insert into missed_call.blocked_numbers (line_id, number, reason) values ($1, '+12395550304', 'junk')",
        [lineId],
      );
      await mark(id, 'booked');
      expect(await reasons('+12395550304')).toEqual(['junk']);
    });

    it('never overwrites or removes a STOP: junk then un-junk leaves opted_out in place', async () => {
      if (!db) return;
      const id = await call('+12395550305');
      await db.pool.query(
        "insert into missed_call.blocked_numbers (line_id, number, reason) values ($1, '+12395550305', 'opted_out')",
        [lineId],
      );
      await mark(id, 'junk');
      expect(await reasons('+12395550305')).toEqual(['opted_out']);
      await mark(id, 'called_back');
      expect(await reasons('+12395550305')).toEqual(['opted_out']);
    });
  },
);
