import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MIGRATIONS_DIR, connectTestDb, isDenied, randomUsNumber, type TestDb } from './harness';

/** The owner-cell confirmation tables and functions, one line per owner, and the START lock. */
let db: TestDb | null = null;

async function owner() {
  const user = await db!.createUser();
  const cell = randomUsNumber();
  const line = await db!.pool.query<{ id: string }>(
    `insert into missed_call.lines (owner_id, owner_cell, business_name, template)
     values ($1, $2, 'Verify Test', 'hi') returning id`,
    [user.id, cell],
  );
  return { user, cell, lineId: line.rows[0]!.id };
}

const reserve = async (ownerId: string, limit = 3, windowSeconds = 3600) =>
  (
    await db!.pool.query<{ ok: boolean }>(
      'select missed_call.reserve_cell_code_send($1, $2, $3) as ok',
      [ownerId, limit, windowSeconds],
    )
  ).rows[0]!.ok;

beforeAll(async () => {
  db = await connectTestDb();
});
afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'owner cell confirmation',
  () => {
    it('owners cannot read or write the challenge or the send log', async () => {
      if (!db) return;
      const o = await owner();
      await db.pool.query(
        `insert into missed_call.cell_verifications (owner_id, phone, code_hash, salt, expires_at)
         values ($1, $2, 'h', 's', now() + interval '10 minutes')`,
        [o.user.id, o.cell],
      );
      for (const sql of [
        'select * from missed_call.cell_verifications',
        'select * from missed_call.cell_verification_sends',
        "update missed_call.cell_verifications set attempts = 0 where owner_id = '" +
          o.user.id +
          "'",
        "delete from missed_call.cell_verifications where owner_id = '" + o.user.id + "'",
      ]) {
        await expect(db.as(o.user, (c) => c.query(sql))).rejects.toSatisfy(isDenied);
      }
      await expect(
        db.as(null, (c) => c.query('select * from missed_call.cell_verifications')),
      ).rejects.toSatisfy(isDenied);
    });

    it('the functions are service-role only', async () => {
      if (!db) return;
      const o = await owner();
      for (const sql of [
        `select missed_call.reserve_cell_code_send('${o.user.id}', 3, 3600)`,
        `select missed_call.consume_cell_attempt('${o.user.id}')`,
        `select missed_call.confirm_owner_cell('${o.user.id}', '${o.cell}')`,
      ]) {
        await expect(db.as(o.user, (c) => c.query(sql))).rejects.toSatisfy(isDenied);
        await expect(db.as(null, (c) => c.query(sql))).rejects.toSatisfy(isDenied);
      }
    });

    it('allows 3 code texts an hour and counts only the window', async () => {
      if (!db) return;
      const o = await owner();
      expect([
        await reserve(o.user.id),
        await reserve(o.user.id),
        await reserve(o.user.id),
      ]).toEqual([true, true, true]);
      expect(await reserve(o.user.id)).toBe(false);
      await db.pool.query(
        "update missed_call.cell_verification_sends set created_at = now() - interval '61 minutes' where owner_id = $1",
        [o.user.id],
      );
      expect(await reserve(o.user.id)).toBe(true);
      const other = await owner();
      expect(await reserve(other.user.id)).toBe(true);
    });

    it('serialises simultaneous requests so the limit holds', async () => {
      if (!db) return;
      const o = await owner();
      const results = await Promise.all(Array.from({ length: 8 }, () => reserve(o.user.id)));
      expect(results.filter(Boolean)).toHaveLength(3);
    });

    it('counts attempts and returns null when nothing is pending', async () => {
      if (!db) return;
      const o = await owner();
      const next = async () =>
        (
          await db!.pool.query<{ n: number | null }>(
            'select missed_call.consume_cell_attempt($1) as n',
            [o.user.id],
          )
        ).rows[0]!.n;
      expect(await next()).toBeNull();
      await db.pool.query(
        `insert into missed_call.cell_verifications (owner_id, phone, code_hash, salt, expires_at)
         values ($1, $2, 'h', 's', now() + interval '10 minutes')`,
        [o.user.id, o.cell],
      );
      expect([await next(), await next(), await next()]).toEqual([1, 2, 3]);
    });

    it('confirm_owner_cell only verifies the number the code went to', async () => {
      if (!db) return;
      const o = await owner();
      const confirm = async (phone: string) =>
        (
          await db!.pool.query<{ ok: boolean }>(
            'select missed_call.confirm_owner_cell($1, $2) as ok',
            [o.user.id, phone],
          )
        ).rows[0]!.ok;
      const verified = async () =>
        (
          await db!.pool.query<{ v: boolean }>(
            'select owner_cell_verified as v from missed_call.lines where id = $1',
            [o.lineId],
          )
        ).rows[0]!.v;
      expect(await confirm(randomUsNumber())).toBe(false);
      expect(await verified()).toBe(false);
      expect(await confirm(o.cell)).toBe(true);
      expect(await verified()).toBe(true);
    });

    it('allows one line per owner', async () => {
      if (!db) return;
      const o = await owner();
      await expect(
        db.pool.query(
          `insert into missed_call.lines (owner_id, owner_cell, business_name, template)
           values ($1, '+12395550102', 'Second', 'hi')`,
          [o.user.id],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('the migration keeps the oldest line and moves calls and blocks onto it', async () => {
      if (!db) return;
      const migration = readFileSync(
        join(MIGRATIONS_DIR, '20261125200500_missed_call_cell_verification.sql'),
        'utf8',
      );
      const block = /do \$\$[\s\S]*?end;\n\$\$;/.exec(migration)?.[0];
      expect(block).toBeTruthy();
      const user = await db.createUser();
      const client = await db.pool.connect();
      try {
        await client.query('begin');
        await client.query('alter table missed_call.lines drop constraint lines_owner_id_key');
        const ids: string[] = [];
        for (const [i, age] of ['3 days', '2 days', '1 day'].entries()) {
          const r = await client.query<{ id: string }>(
            `insert into missed_call.lines (owner_id, provider_number, owner_cell, business_name, template, created_at)
             values ($1, $2, '+12395550101', 'Dup ' || $3::text, 'hi', now() - $4::interval) returning id`,
            [user.id, randomUsNumber(), String(i), age],
          );
          ids.push(r.rows[0]!.id);
        }
        const [oldest, middle, newest] = ids as [string, string, string];
        await client.query(
          `insert into missed_call.calls (line_id, caller_number, provider_call_sid) values
             ($1, '+12395550301', $4), ($2, '+12395550302', $5), ($3, '+12395550303', $6)`,
          [oldest, middle, newest, `CA-d1-${oldest}`, `CA-d2-${middle}`, `CA-d3-${newest}`],
        );
        await client.query(
          `insert into missed_call.blocked_numbers (line_id, number, reason) values
             ($1, '+12395550401', 'junk'), ($2, '+12395550401', 'opted_out'), ($2, '+12395550402', 'junk')`,
          [oldest, newest],
        );
        await client.query(block!);
        const lines = await client.query('select id from missed_call.lines where owner_id = $1', [
          user.id,
        ]);
        expect(lines.rows).toEqual([{ id: oldest }]);
        const calls = await client.query(
          'select line_id from missed_call.calls where line_id = any($1::uuid[])',
          [ids],
        );
        expect(calls.rows).toEqual([{ line_id: oldest }, { line_id: oldest }, { line_id: oldest }]);
        const blocks = await client.query<{ number: string; reason: string }>(
          'select number, reason from missed_call.blocked_numbers where line_id = $1 order by number',
          [oldest],
        );
        expect(blocks.rows).toEqual([
          { number: '+12395550401', reason: 'junk' },
          { number: '+12395550402', reason: 'junk' },
        ]);
      } finally {
        await client.query('rollback');
        client.release();
      }
    });

    it('clear_opt_out waits for the caller lock like the other call and reply functions', async () => {
      if (!db) return;
      const o = await owner();
      const number = '+12395550777';
      await db.pool.query(
        "insert into missed_call.blocked_numbers (line_id, number, reason) values ($1, $2, 'opted_out')",
        [o.lineId, number],
      );
      const holder = await db.pool.connect();
      try {
        await holder.query('begin');
        await holder.query(
          'select pg_advisory_xact_lock(hashtextextended($1::text || $2::text, 0))',
          [o.lineId, number],
        );
        let done = false;
        const pending = db.pool
          .query('select missed_call.clear_opt_out($1, $2)', [o.lineId, number])
          .then(() => (done = true));
        await new Promise((r) => setTimeout(r, 400));
        expect(done).toBe(false);
        await holder.query('commit');
        await pending;
        expect(done).toBe(true);
      } finally {
        holder.release();
      }
    });
  },
);
