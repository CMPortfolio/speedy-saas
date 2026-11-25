import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectTestDb, isDenied, type TestDb, type TestUser } from './harness';

let db: TestDb | null = null;
let alice: TestUser;
let bob: TestUser;
let aliceLine: string;
let bobLine: string;
let aliceCall: string;

const CALLER = '+12395550123';
const RUN = crypto.randomUUID().slice(0, 8);

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  alice = await db.createUser();
  bob = await db.createUser();
  const lines = await db.asService(async (c) => {
    const a = await c.query<{ id: string }>(
      `insert into missed_call.lines (owner_id, provider_number, owner_cell, business_name, template)
       values ($1, $2, '+12395550101', 'Alice Plumbing', 'Sorry we missed you.') returning id`,
      [alice.id, `+1239555${String(Math.floor(Math.random() * 9000) + 1000)}`],
    );
    const b = await c.query<{ id: string }>(
      `insert into missed_call.lines (owner_id, provider_number, owner_cell, business_name, template)
       values ($1, $2, '+12395550102', 'Bob Electric', 'Sorry we missed you.') returning id`,
      [bob.id, `+1239556${String(Math.floor(Math.random() * 9000) + 1000)}`],
    );
    return { a: a.rows[0]!.id, b: b.rows[0]!.id };
  });
  aliceLine = lines.a;
  bobLine = lines.b;
  aliceCall = await db.asService(async (c) => {
    const r = await c.query<{ id: string }>(
      `insert into missed_call.calls (line_id, caller_number, provider_call_sid)
       values ($1, $2, $3) returning id`,
      [aliceLine, CALLER, `CA${crypto.randomUUID()}`],
    );
    await c.query(
      `insert into missed_call.messages (call_id, direction, body) values ($1, 'out', 'hello')`,
      [r.rows[0]!.id],
    );
    return r.rows[0]!.id;
  });
});

afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'missed_call schema RLS',
  () => {
    it('owners see only their own lines, calls and messages', async () => {
      if (!db) return;
      const aliceSees = await db.as(alice, async (c) => ({
        lines: (await c.query('select id from missed_call.lines')).rows,
        calls: (await c.query('select id from missed_call.calls')).rows,
        messages: (await c.query('select id from missed_call.messages')).rows,
      }));
      expect(aliceSees.lines).toEqual([{ id: aliceLine }]);
      expect(aliceSees.calls).toEqual([{ id: aliceCall }]);
      expect(aliceSees.messages).toHaveLength(1);

      const bobSees = await db.as(bob, async (c) => ({
        lines: (await c.query('select id from missed_call.lines')).rows,
        calls: (await c.query('select id from missed_call.calls')).rows,
        messages: (await c.query('select id from missed_call.messages')).rows,
      }));
      expect(bobSees.lines).toEqual([{ id: bobLine }]);
      expect(bobSees.calls).toEqual([]);
      expect(bobSees.messages).toEqual([]);
    });

    it('anon sees and does nothing', async () => {
      if (!db) return;
      await expect(
        db.as(null, (c) => c.query('select * from missed_call.lines')),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(null, (c) => c.query('select * from missed_call.calls')),
      ).rejects.toSatisfy(isDenied);
    });

    it('an owner cannot change another owner line or its calls', async () => {
      if (!db) return;
      const line = await db.as(bob, (c) =>
        c.query("update missed_call.lines set business_name = 'hacked' where id = $1", [aliceLine]),
      );
      expect(line.rowCount).toBe(0);
      const call = await db.as(bob, (c) =>
        c.query("update missed_call.calls set status = 'junk' where id = $1", [aliceCall]),
      );
      expect(call.rowCount).toBe(0);
      const del = await db.as(bob, (c) =>
        c.query('delete from missed_call.lines where id = $1', [aliceLine]),
      );
      expect(del.rowCount).toBe(0);
    });

    it('an owner cannot create a line for someone else', async () => {
      if (!db) return;
      await expect(
        db.as(bob, (c) =>
          c.query(
            `insert into missed_call.lines (owner_id, owner_cell, business_name, template)
             values ($1, '+12395550103', 'Fake', 'hi')`,
            [alice.id],
          ),
        ),
      ).rejects.toSatisfy(isDenied);
    });

    it('an owner can create and edit their own line but never set the provider number', async () => {
      if (!db) return;
      await db.as(bob, async (c) => {
        const made = await c.query<{ id: string }>(
          `insert into missed_call.lines (owner_id, owner_cell, business_name, template)
           values ($1, '+12395550104', 'Bob Two', 'hi') returning id`,
          [bob.id],
        );
        const edited = await c.query(
          "update missed_call.lines set template = 'Call you back soon' where id = $1",
          [made.rows[0]!.id],
        );
        expect(edited.rowCount).toBe(1);
      });
      await expect(
        db.as(bob, (c) =>
          c.query(
            `insert into missed_call.lines (owner_id, provider_number, owner_cell, business_name, template)
             values ($1, '+12395550199', '+12395550104', 'Bob Three', 'hi')`,
            [bob.id],
          ),
        ),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(bob, (c) =>
          c.query("update missed_call.lines set provider_number = '+12395550198' where id = $1", [
            bobLine,
          ]),
        ),
      ).rejects.toSatisfy(isDenied);
    });

    it('owners can set a call status but cannot insert, delete or edit anything else', async () => {
      if (!db) return;
      const ok = await db.as(alice, (c) =>
        c.query("update missed_call.calls set status = 'called_back' where id = $1", [aliceCall]),
      );
      expect(ok.rowCount).toBe(1);
      await expect(
        db.as(alice, (c) =>
          c.query(
            `insert into missed_call.calls (line_id, caller_number, provider_call_sid)
             values ($1, $2, 'CAforged')`,
            [aliceLine, CALLER],
          ),
        ),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(alice, (c) =>
          c.query("update missed_call.calls set caller_number = '+12395550999' where id = $1", [
            aliceCall,
          ]),
        ),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(alice, (c) => c.query('delete from missed_call.calls where id = $1', [aliceCall])),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(alice, (c) =>
          c.query(
            "insert into missed_call.messages (call_id, direction, body) values ($1,'in','x')",
            [aliceCall],
          ),
        ),
      ).rejects.toSatisfy(isDenied);
    });

    it('blocked numbers: owners manage their own line only', async () => {
      if (!db) return;
      await db.as(alice, async (c) => {
        await c.query('insert into missed_call.blocked_numbers (line_id, number) values ($1, $2)', [
          aliceLine,
          CALLER,
        ]);
        const mine = await c.query('select id from missed_call.blocked_numbers');
        expect(mine.rowCount).toBe(1);
      });
      await expect(
        db.as(bob, (c) =>
          c.query('insert into missed_call.blocked_numbers (line_id, number) values ($1, $2)', [
            aliceLine,
            CALLER,
          ]),
        ),
      ).rejects.toSatisfy(isDenied);
    });

    it('log_missed_call is callable only by the service role', async () => {
      if (!db) return;
      const call = (c: { query: (q: string, v: unknown[]) => Promise<unknown> }) =>
        c.query('select * from missed_call.log_missed_call($1, $2, $3)', [
          aliceLine,
          '+12395550777',
          `CA${crypto.randomUUID()}`,
        ]);
      await expect(db.as(alice, call)).rejects.toSatisfy(isDenied);
      await expect(db.as(null, call)).rejects.toSatisfy(isDenied);
      await db.as(alice, async () => undefined);
      const res = await db.pool.query(
        'select 1 from information_schema.routine_privileges where routine_schema = $1 and routine_name = $2 and grantee = $3',
        ['missed_call', 'log_missed_call', 'service_role'],
      );
      expect(res.rowCount).toBeGreaterThan(0);
    });

    it('log_missed_call: send, then cooldown, duplicate sid and blocked', async () => {
      if (!db) return;
      const caller = '+12395550888';
      const run = (sid: string, who = caller) =>
        db!.asService(async (c) => {
          const r = await c.query<{ call_id: string; outcome: string; first_contact: boolean }>(
            'select * from missed_call.log_missed_call($1, $2, $3)',
            [aliceLine, who, sid],
          );
          return r.rows[0]!;
        });
      const first = await run(`CA-first-${RUN}`);
      expect(first.outcome).toBe('send');
      expect(first.first_contact).toBe(true);
      expect((await run(`CA-second-${RUN}`)).outcome).toBe('cooldown');
      expect((await run(`CA-first-${RUN}`)).outcome).toBe('duplicate');

      // The cooldown ends 24 hours after the text.
      await db.asService((c) =>
        c.query(
          "update missed_call.calls set texted_at = now() - interval '24 hours 1 minute' where id = $1",
          [first.call_id],
        ),
      );
      const later = await run(`CA-third-${RUN}`);
      expect(later.outcome).toBe('send');
      expect(later.first_contact).toBe(false);

      await db.asService((c) =>
        c.query('insert into missed_call.blocked_numbers (line_id, number) values ($1, $2)', [
          aliceLine,
          '+12395550889',
        ]),
      );
      expect((await run(`CA-blocked-${RUN}`, '+12395550889')).outcome).toBe('blocked');
    });
  },
);
