import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectTestDb, type TestDb, randomUsNumber } from './harness';

/** The caps on forwarded replies in missed_call.record_reply, at their edges. */
let db: TestDb | null = null;
let seq = 0;
const CALLER = '+12395550771';

async function newLine(callers: string[] = [CALLER]): Promise<string> {
  const owner = await db!.createUser();
  const number = randomUsNumber();
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
      const claim = async (who: string, body = 'Reply Cap: reply STOP to opt out.') =>
        (
          await db!.pool.query<{ id: string | null }>(
            'select missed_call.claim_help_reply($1, $2, $3) as id',
            [line, who, body],
          )
        ).rows[0]!.id !== null;
      expect(await claim('+12395550999')).toBe(false);
      expect(await claim(CALLER)).toBe(true);
      expect(await claim(CALLER)).toBe(false);
      await db.pool.query(
        "update missed_call.messages m set created_at = now() - interval '24 hours 1 minute' from missed_call.calls c where c.id = m.call_id and c.line_id = $1 and m.direction = 'out'",
        [line],
      );
      expect(await claim(CALLER)).toBe(true);
    });

    it('claim_help_reply matches on the kind of message, not the wording', async () => {
      if (!db) return;
      const line = await newLine();
      const claim = async (body: string) =>
        (
          await db!.pool.query<{ id: string | null }>(
            'select missed_call.claim_help_reply($1, $2, $3) as id',
            [line, CALLER, body],
          )
        ).rows[0]!.id;
      // An ordinary outgoing text with the same words does not use up the HELP answer.
      await db.pool.query(
        `insert into missed_call.messages (call_id, direction, body)
         select id, 'out', 'same words' from missed_call.calls where line_id = $1`,
        [line],
      );
      const first = await claim('same words');
      expect(first).not.toBeNull();
      // A different wording within the day is still the same HELP answer.
      expect(await claim('other words')).toBeNull();
      // Releasing the claim (the send failed) lets the next HELP through.
      await db.pool.query('delete from missed_call.messages where id = $1 and kind = $2', [
        first,
        'help',
      ]);
      expect(await claim('other words')).not.toBeNull();
    });

    it('per line: 200 replies a day, counting 23 hours ago but not 25 hours ago', async () => {
      if (!db) return;
      const callers = Array.from({ length: 5 }, (_v, i) => `+1239550${String(7000 + i)}`);
      const within = await newLine([CALLER, ...callers]);
      for (const c of callers) await seed(within, c, 40, '23 hours');
      expect(await reply(within)).toBe('rate_limited');
      const outside = await newLine([CALLER, ...callers]);
      for (const c of callers) await seed(outside, c, 40, '25 hours');
      expect(await reply(outside)).toBe('recorded');
      const edge = await newLine([CALLER, ...callers]);
      for (const c of callers.slice(0, 4)) await seed(edge, c, 40, '23 hours');
      await seed(edge, callers[4]!, 39, '23 hours');
      expect(await reply(edge)).toBe('recorded');
      expect(await reply(edge)).toBe('rate_limited');
    });

    it('per caller: stores at most 50 replies a day, then drops the rest', async () => {
      if (!db) return;
      const line = await newLine();
      await seed(line, CALLER, 49, '3 hours');
      expect(await reply(line)).toBe('rate_limited');
      expect(await saved(line)).toBe(50);
      expect(await reply(line)).toBe('dropped');
      expect(await saved(line)).toBe(50);
      const older = await newLine();
      await seed(older, CALLER, 50, '25 hours');
      expect(await reply(older)).toBe('recorded');
    });

    it('clear_opt_out lifts a STOP and restores the junk block while a junk call remains', async () => {
      if (!db) return;
      const line = await newLine();
      const reasons = async () =>
        (
          await db!.pool.query<{ reason: string }>(
            'select reason from missed_call.blocked_numbers where line_id = $1 and number = $2',
            [line, CALLER],
          )
        ).rows.map((r) => r.reason);
      const clear = () =>
        db!.pool.query('select missed_call.clear_opt_out($1, $2)', [line, CALLER]);
      const stop = () =>
        db!.pool.query(
          `insert into missed_call.blocked_numbers (line_id, number, reason) values ($1, $2, 'opted_out')
           on conflict (line_id, number) do update set reason = 'opted_out'`,
          [line, CALLER],
        );
      await stop();
      await clear();
      expect(await reasons()).toEqual([]);
      await db.pool.query("update missed_call.calls set status = 'junk' where line_id = $1", [
        line,
      ]);
      await stop();
      await clear();
      expect(await reasons()).toEqual(['junk']);
      await clear();
      expect(await reasons()).toEqual(['junk']);
    });
  },
);
