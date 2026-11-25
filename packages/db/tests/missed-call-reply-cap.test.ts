import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectTestDb, type TestDb } from './harness';

/** The caps on forwarded replies in missed_call.record_reply, at their edges. */
let db: TestDb | null = null;
let seq = 0;
const CALLER = '+12395550771';

async function newLine(callers: string[] = [CALLER]): Promise<string> {
  const owner = await db!.createUser();
  const number = `+1239551${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const line = await db!.pool.query<{ id: string }>(
    `insert into missed_call.lines (owner_id, provider_number, owner_cell, business_name, template)
     values ($1, $2, '+12395550101', 'Reply Cap', 'hi') returning id`,
    [owner.id, number],
  );
  for (const caller of callers) {
    await db!.pool.query(
      `insert into missed_call.calls (line_id, caller_number, provider_call_sid)
       values ($1, $2, $3)`,
      [line.rows[0]!.id, caller, `CA-cap-${crypto.randomUUID()}`],
    );
  }
  return line.rows[0]!.id;
}

/** `count` inbound replies from `caller` saved `ago` ago. */
async function seed(lineId: string, caller: string, count: number, ago: string): Promise<void> {
  await db!.pool.query(
    `insert into missed_call.messages (call_id, direction, body, provider_message_id, created_at)
     select c.id, 'in', 'seed', 'SM-seed-' || gen_random_uuid()::text, now() - $4::interval
     from missed_call.calls c, generate_series(1, $3::int) g
     where c.line_id = $1::uuid and c.caller_number = $2`,
    [lineId, caller, count, ago],
  );
}

async function reply(lineId: string, caller = CALLER): Promise<string> {
  seq += 1;
  const { rows } = await db!.pool.query<{ outcome: string }>(
    'select * from missed_call.record_reply($1, $2, $3, $4)',
    [lineId, caller, 'hello', `SM-cap-${crypto.randomUUID()}-${seq}`],
  );
  return rows[0]!.outcome;
}

const saved = async (lineId: string) =>
  (
    await db!.pool.query<{ n: number }>(
      `select count(*)::int as n from missed_call.messages m join missed_call.calls c on c.id = m.call_id
       where c.line_id = $1 and m.direction = 'in'`,
      [lineId],
    )
  ).rows[0]!.n;

beforeAll(async () => {
  db = await connectTestDb();
});
afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'forwarded reply caps',
  () => {
    it('per caller: the 5th reply in an hour is forwarded, the 6th is saved but not', async () => {
      if (!db) return;
      const line = await newLine();
      await seed(line, CALLER, 4, '10 minutes');
      expect(await reply(line)).toBe('recorded');
      expect(await reply(line)).toBe('rate_limited');
      expect(await saved(line)).toBe(6);
    });

    it('per caller: counts 59 minutes ago, not 61 minutes ago', async () => {
      if (!db) return;
      const recent = await newLine();
      await seed(recent, CALLER, 5, '59 minutes');
      expect(await reply(recent)).toBe('rate_limited');
      const older = await newLine();
      await seed(older, CALLER, 5, '61 minutes');
      expect(await reply(older)).toBe('recorded');
    });

    it('per caller: 20 a day, counting 23 hours ago but not 25 hours ago', async () => {
      if (!db) return;
      const within = await newLine();
      await seed(within, CALLER, 19, '3 hours');
      expect(await reply(within)).toBe('recorded');
      expect(await reply(within)).toBe('rate_limited');
      const edge = await newLine();
      await seed(edge, CALLER, 20, '23 hours');
      expect(await reply(edge)).toBe('rate_limited');
      const outside = await newLine();
      await seed(outside, CALLER, 20, '25 hours');
      expect(await reply(outside)).toBe('recorded');
    });

    it('per line: the 30th reply in an hour is forwarded, the 31st is not', async () => {
      if (!db) return;
      const callers = Array.from({ length: 9 }, (_v, i) => `+1239550${String(8000 + i)}`);
      const line = await newLine([CALLER, ...callers]);
      for (const c of callers) await seed(line, c, 3, '10 minutes');
      await seed(line, CALLER, 2, '10 minutes');
      expect(await reply(line)).toBe('recorded');
      expect(await reply(line)).toBe('rate_limited');
    });

    it('one noisy caller does not use up another caller allowance', async () => {
      if (!db) return;
      const other = '+12395550772';
      const line = await newLine([CALLER, other]);
      await seed(line, CALLER, 5, '5 minutes');
      expect(await reply(line, CALLER)).toBe('rate_limited');
      expect(await reply(line, other)).toBe('recorded');
    });

    it('records and forwards a reply from a caller who texted STOP; drops junk and manual', async () => {
      if (!db) return;
      const line = await newLine();
      const block = (reason: string) =>
        db!.pool.query(
          `insert into missed_call.blocked_numbers (line_id, number, reason) values ($1, $2, $3)
           on conflict (line_id, number) do update set reason = excluded.reason`,
          [line, CALLER, reason],
        );
      await block('opted_out');
      expect(await reply(line)).toBe('recorded');
      await block('junk');
      expect(await reply(line)).toBe('blocked');
      await block('manual');
      expect(await reply(line)).toBe('blocked');
    });

    it('claim_help_reply: only for a number that called, once a day', async () => {
      if (!db) return;
      const line = await newLine();
      const claim = async (who: string) =>
        (
          await db!.pool.query<{ ok: boolean }>(
            'select missed_call.claim_help_reply($1, $2, $3) as ok',
            [line, who, 'Reply Cap: reply STOP to opt out.'],
          )
        ).rows[0]!.ok;
      expect(await claim('+12395550999')).toBe(false);
      expect(await claim(CALLER)).toBe(true);
      expect(await claim(CALLER)).toBe(false);
      await db.pool.query(
        "update missed_call.messages m set created_at = now() - interval '24 hours 1 minute' from missed_call.calls c where c.id = m.call_id and c.line_id = $1 and m.direction = 'out'",
        [line],
      );
      expect(await claim(CALLER)).toBe(true);
    });
  },
);
