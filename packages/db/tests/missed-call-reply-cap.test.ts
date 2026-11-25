import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectTestDb, type TestDb } from './harness';

/** The per-line cap on forwarded replies in missed_call.record_reply, at its edges. */
let db: TestDb | null = null;
let seq = 0;

async function newLineWithCall(caller: string): Promise<string> {
  const owner = await db!.createUser();
  const number = `+1239551${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const line = await db!.pool.query<{ id: string }>(
    `insert into missed_call.lines (owner_id, provider_number, owner_cell, business_name, template)
     values ($1, $2, '+12395550101', 'Reply Cap', 'hi') returning id`,
    [owner.id, number],
  );
  await db!.pool.query(
    `insert into missed_call.calls (line_id, caller_number, provider_call_sid)
     values ($1, $2, $3)`,
    [line.rows[0]!.id, caller, `CA-cap-${crypto.randomUUID()}`],
  );
  return line.rows[0]!.id;
}

/** `count` inbound replies saved `ago` ago on the line's call. */
async function seedReplies(lineId: string, count: number, ago: string): Promise<void> {
  await db!.pool.query(
    `insert into missed_call.messages (call_id, direction, body, provider_message_id, created_at)
     select c.id, 'in', 'seed', 'SM-seed-' || c.id::text || '-' || g || '-' || $3::text,
            now() - $3::interval
     from missed_call.calls c, generate_series(1, $2::int) g
     where c.line_id = $1::uuid`,
    [lineId, count, ago],
  );
}

async function reply(lineId: string, caller: string) {
  seq += 1;
  const { rows } = await db!.pool.query<{ outcome: string; forward: boolean }>(
    'select * from missed_call.record_reply($1, $2, $3, $4)',
    [lineId, caller, 'hello', `SM-cap-${crypto.randomUUID()}-${seq}`],
  );
  return rows[0]!;
}

beforeAll(async () => {
  db = await connectTestDb();
});
afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'reply forward cap per line',
  () => {
    const caller = '+12395550771';

    it('forwards the 30th reply in an hour and saves but does not forward the 31st', async () => {
      if (!db) return;
      const line = await newLineWithCall(caller);
      await seedReplies(line, 29, '10 minutes');
      expect(await reply(line, caller)).toMatchObject({ outcome: 'recorded', forward: true });
      expect(await reply(line, caller)).toMatchObject({ outcome: 'recorded', forward: false });
      const saved = await db.pool.query(
        "select count(*)::int as n from missed_call.messages m join missed_call.calls c on c.id = m.call_id where c.line_id = $1 and m.direction = 'in'",
        [line],
      );
      expect(saved.rows[0]).toEqual({ n: 31 });
    });

    it('counts replies from 59 minutes ago but not from 61 minutes ago', async () => {
      if (!db) return;
      const recent = await newLineWithCall(caller);
      await seedReplies(recent, 30, '59 minutes');
      expect((await reply(recent, caller)).forward).toBe(false);
      const older = await newLineWithCall(caller);
      await seedReplies(older, 30, '61 minutes');
      expect((await reply(older, caller)).forward).toBe(true);
    });

    it('counts every caller on the line, not each caller separately', async () => {
      if (!db) return;
      const line = await newLineWithCall(caller);
      await db.pool.query(
        `insert into missed_call.calls (line_id, caller_number, provider_call_sid)
         values ($1, '+12395550772', $2)`,
        [line, `CA-cap-${crypto.randomUUID()}`],
      );
      await seedReplies(line, 30, '5 minutes');
      expect((await reply(line, '+12395550772')).forward).toBe(false);
    });
  },
);
