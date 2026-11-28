import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectTestDb, type TestDb, randomUsNumber } from './harness';

/** The per-line caps on auto-texts in missed_call.log_missed_call, at their edges. */
let db: TestDb | null = null;
const RUN = crypto.randomUUID().slice(0, 8);
let seq = 0;

async function newLine(): Promise<string> {
  const owner = await db!.createUser();
  const number = randomUsNumber();
  const { rows } = await db!.pool.query<{ id: string }>(
    `insert into missed_call.lines (owner_id, provider_number, owner_cell, business_name, template)
     values ($1, $2, '+12395550101', 'Cap Test', 'hi') returning id`,
    [owner.id, number],
  );
  return rows[0]!.id;
}

/** `count` calls from distinct numbers, each texted `ago` ago. */
async function seed(lineId: string, count: number, ago: string, offset = 0): Promise<void> {
  await db!.pool.query(
    `insert into missed_call.calls (line_id, caller_number, provider_call_sid, texted_at, status)
     select $1::uuid, '+1239553' || lpad((g + $4::int)::text, 4, '0'),
            'CA-seed-' || $1::text || '-' || (g + $4::int),
            now() - $3::interval, 'texted'
     from generate_series(1, $2::int) g`,
    [lineId, count, ago, offset],
  );
}

async function call(lineId: string, extra = ''): Promise<string> {
  seq += 1;
  const caller = `+1239552${String(seq).padStart(4, '0')}`;
  const { rows } = await db!.pool.query<{ outcome: string }>(
    `select * from missed_call.log_missed_call($1, $2, $3${extra})`,
    [lineId, caller, `CA-${RUN}-${seq}`],
  );
  return rows[0]!.outcome;
}

beforeAll(async () => {
  db = await connectTestDb();
});
afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'auto-text caps per line',
  () => {
    it('allows 20 texts in an hour and rate limits the 21st, still logging the call', async () => {
      if (!db) return;
      const line = await newLine();
      for (let i = 0; i < 20; i += 1) expect(await call(line)).toBe('send');
      expect(await call(line)).toBe('rate_limited');
      const logged = await db.pool.query(
        'select count(*)::int as n from missed_call.calls where line_id = $1 and texted_at is null',
        [line],
      );
      expect(logged.rows[0]).toEqual({ n: 1 });
    });

    it('counts texts from 59 minutes ago but not from 61 minutes ago', async () => {
      if (!db) return;
      const recent = await newLine();
      await seed(recent, 20, '59 minutes');
      expect(await call(recent)).toBe('rate_limited');
      const older = await newLine();
      await seed(older, 20, '61 minutes');
      expect(await call(older)).toBe('send');
    });

    it('allows 100 texts a day and rate limits the 101st', async () => {
      if (!db) return;
      const line = await newLine();
      await seed(line, 99, '5 hours');
      expect(await call(line)).toBe('send');
      expect(await call(line)).toBe('rate_limited');
    });

    it('counts texts from 23 hours ago but not from 25 hours ago against the day', async () => {
      if (!db) return;
      const within = await newLine();
      await seed(within, 100, '23 hours');
      expect(await call(within)).toBe('rate_limited');
      const outside = await newLine();
      await seed(outside, 100, '25 hours');
      expect(await call(outside)).toBe('send');
    });

    it('does not count calls that were never texted, or other lines', async () => {
      if (!db) return;
      const line = await newLine();
      const other = await newLine();
      await seed(other, 50, '1 minute');
      await db.pool.query(
        `insert into missed_call.calls (line_id, caller_number, provider_call_sid)
         select $1::uuid, '+1239553' || lpad((g + 500)::text, 4, '0'), 'CA-untexted-' || $1::text || g
         from generate_series(1, 30) g`,
        [line],
      );
      expect(await call(line)).toBe('send');
    });

    it('skips the text but logs the call when the caller is not allowed text (foreign)', async () => {
      if (!db) return;
      const line = await newLine();
      expect(await call(line, ", interval '24 hours', false")).toBe('foreign');
      const row = await db.pool.query(
        'select texted_at from missed_call.calls where line_id = $1',
        [line],
      );
      expect(row.rows).toEqual([{ texted_at: null }]);
    });

    it('serialises simultaneous calls from different numbers so the cap holds', async () => {
      if (!db) return;
      const line = await newLine();
      await seed(line, 15, '10 minutes');
      const outcomes = await Promise.all(Array.from({ length: 10 }, () => call(line)));
      expect(outcomes.filter((o) => o === 'send')).toHaveLength(5);
      expect(outcomes.filter((o) => o === 'rate_limited')).toHaveLength(5);
    });
  },
);
