import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectTestDb, isDenied, type TestDb, type TestUser, randomUsNumber } from './harness';

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
      [alice.id, randomUsNumber()],
    );
    const b = await c.query<{ id: string }>(
      `insert into missed_call.lines (owner_id, provider_number, owner_cell, business_name, template)
       values ($1, $2, '+12395550102', 'Bob Electric', 'Sorry we missed you.') returning id`,
      [bob.id, randomUsNumber()],
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
      await expect(
        db.as(bob, (c) =>
          c.query("update missed_call.calls set status = 'junk' where id = $1", [aliceCall]),
        ),
      ).rejects.toSatisfy(isDenied);
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
      const edited = await db.as(bob, (c) =>
        c.query("update missed_call.lines set template = 'Call you back soon' where id = $1", [
          bobLine,
        ]),
      );
      expect(edited.rowCount).toBe(1);
      // v1 is one line per owner.
      await expect(
        db.as(bob, (c) =>
          c.query(
            `insert into missed_call.lines (owner_id, owner_cell, business_name, template)
             values ($1, '+12395550104', 'Bob Two', 'hi')`,
            [bob.id],
          ),
        ),
      ).rejects.toMatchObject({ code: '23505' });
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

    it('owners set a call status only through mark_call and cannot insert, delete or edit anything else', async () => {
      if (!db) return;
      await db.as(alice, async (c) => {
        await c.query("select missed_call.mark_call($1, 'called_back')", [aliceCall]);
        const row = await c.query('select status from missed_call.calls where id = $1', [
          aliceCall,
        ]);
        expect(row.rows[0]).toEqual({ status: 'called_back' });
      });
      await expect(
        db.as(alice, (c) =>
          c.query("update missed_call.calls set status = 'booked' where id = $1", [aliceCall]),
        ),
      ).rejects.toSatisfy(isDenied);
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

    it('log_missed_call: the cooldown ends exactly at 24 hours', async () => {
      if (!db) return;
      const caller = '+12395550890';
      const run = (sid: string) =>
        db!.asService(async (c) => {
          const r = await c.query<{ call_id: string; outcome: string }>(
            'select * from missed_call.log_missed_call($1, $2, $3)',
            [aliceLine, caller, sid],
          );
          return r.rows[0]!;
        });
      const first = await run(`CA-edge1-${RUN}`);
      const setAge = (age: string) =>
        db!.asService((c) =>
          c.query('update missed_call.calls set texted_at = now() - $2::interval where id = $1', [
            first.call_id,
            age,
          ]),
        );
      await setAge('23:59:59');
      expect((await run(`CA-edge2-${RUN}`)).outcome).toBe('cooldown');
      await setAge('24:00:01');
      expect((await run(`CA-edge3-${RUN}`)).outcome).toBe('send');
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

    it('record_reply: attaches to the latest call, sets replied, ignores retries and blocked', async () => {
      if (!db) return;
      const caller = '+12395550444';
      const log = (sid: string) =>
        db!.asService((c) =>
          c.query('select * from missed_call.log_missed_call($1, $2, $3)', [
            aliceLine,
            caller,
            sid,
          ]),
        );
      await log(`CA-r1-${RUN}`);
      await db.asService((c) =>
        c.query(
          "update missed_call.calls set received_at = now() - interval '1 hour' where provider_call_sid = $1",
          [`CA-r1-${RUN}`],
        ),
      );
      const second = (await log(`CA-r2-${RUN}`)).rows[0] as { call_id: string };
      const reply = (body: string, id: string | null, who = caller) =>
        db!.asService(async (c) => {
          const r = await c.query<{ call_id: string | null; outcome: string }>(
            'select * from missed_call.record_reply($1, $2, $3, $4)',
            [aliceLine, who, body, id],
          );
          return r.rows[0]!;
        });
      const first = await reply('leaking water heater', `SM-${RUN}-1`);
      expect(first).toEqual({ call_id: second.call_id, outcome: 'recorded' });
      expect((await reply('leaking water heater', `SM-${RUN}-1`)).outcome).toBe('duplicate');
      const status = await db.pool.query('select status from missed_call.calls where id = $1', [
        second.call_id,
      ]);
      expect(status.rows[0]).toEqual({ status: 'replied' });
      const count = await db.pool.query(
        "select count(*)::int as n from missed_call.messages where call_id = $1 and direction = 'in'",
        [second.call_id],
      );
      expect(count.rows[0]).toEqual({ n: 1 });
      expect((await reply('hello', `SM-${RUN}-2`, '+12395550445')).outcome).toBe('no_call');
      await db.asService((c) =>
        c.query('insert into missed_call.blocked_numbers (line_id, number) values ($1, $2)', [
          aliceLine,
          '+12395550446',
        ]),
      );
      await log(`CA-r3-${RUN}`);
      expect((await reply('hi', `SM-${RUN}-3`, '+12395550446')).outcome).toBe('blocked');
    });

    it('record_reply keeps a status the owner already set', async () => {
      if (!db) return;
      const caller = '+12395550447';
      const logged = await db.asService((c) =>
        c.query<{ call_id: string }>('select * from missed_call.log_missed_call($1, $2, $3)', [
          aliceLine,
          caller,
          `CA-keep-${RUN}`,
        ]),
      );
      const id = logged.rows[0]!.call_id;
      await db.asService((c) =>
        c.query("update missed_call.calls set status = 'booked' where id = $1", [id]),
      );
      await db.asService((c) =>
        c.query('select * from missed_call.record_reply($1, $2, $3, $4)', [
          aliceLine,
          caller,
          'see you at 3',
          `SM-${RUN}-keep`,
        ]),
      );
      const row = await db.pool.query('select status from missed_call.calls where id = $1', [id]);
      expect(row.rows[0]).toEqual({ status: 'booked' });
    });

    it('record_reply is not callable by owners or anon', async () => {
      if (!db) return;
      const call = (c: { query: (q: string, v: unknown[]) => Promise<unknown> }) =>
        c.query('select * from missed_call.record_reply($1, $2, $3, $4)', [
          aliceLine,
          CALLER,
          'x',
          null,
        ]);
      await expect(db.as(alice, call)).rejects.toSatisfy(isDenied);
      await expect(db.as(null, call)).rejects.toSatisfy(isDenied);
    });

    it('mark_call: Junk blocks the number, undoing it lifts the block, STOP blocks stay', async () => {
      if (!db) return;
      const caller = '+12395550448';
      const id = (
        await db.asService((c) =>
          c.query<{ call_id: string }>('select * from missed_call.log_missed_call($1, $2, $3)', [
            aliceLine,
            caller,
            `CA-junk-${RUN}`,
          ]),
        )
      ).rows[0]!.call_id;
      const blocked = () =>
        db!.pool.query(
          'select reason from missed_call.blocked_numbers where line_id = $1 and number = $2',
          [aliceLine, caller],
        );

      await db.asCommitted(alice, (c) => c.query("select missed_call.mark_call($1, 'junk')", [id]));
      expect((await blocked()).rows).toEqual([{ reason: 'junk' }]);
      const again = await db.asService((c) =>
        c.query<{ outcome: string }>('select * from missed_call.log_missed_call($1, $2, $3)', [
          aliceLine,
          caller,
          `CA-junk2-${RUN}`,
        ]),
      );
      expect(again.rows[0]?.outcome).toBe('blocked');

      await db.asCommitted(alice, (c) =>
        c.query("select missed_call.mark_call($1, 'called_back')", [id]),
      );
      expect((await blocked()).rowCount).toBe(0);

      await db.asService((c) =>
        c.query(
          "insert into missed_call.blocked_numbers (line_id, number, reason) values ($1, $2, 'opted_out')",
          [aliceLine, caller],
        ),
      );
      await db.asCommitted(alice, (c) =>
        c.query("select missed_call.mark_call($1, 'booked')", [id]),
      );
      expect((await blocked()).rows).toEqual([{ reason: 'opted_out' }]);
    });

    it('mark_call only touches the owner own calls and only the three owner statuses', async () => {
      if (!db) return;
      await expect(
        db.as(bob, (c) => c.query("select missed_call.mark_call($1, 'junk')", [aliceCall])),
      ).rejects.toMatchObject({ code: 'P0002' });
      await expect(
        db.as(alice, (c) => c.query("select missed_call.mark_call($1, 'replied')", [aliceCall])),
      ).rejects.toMatchObject({ code: '22023' });
      await expect(
        db.as(null, (c) => c.query("select missed_call.mark_call($1, 'junk')", [aliceCall])),
      ).rejects.toSatisfy(isDenied);
    });

    it('owners cannot lift a STOP or forge one; the service role can (START)', async () => {
      if (!db) return;
      const number = '+12395550661';
      await db.asService((c) =>
        c.query(
          "insert into missed_call.blocked_numbers (line_id, number, reason) values ($1, $2, 'opted_out')",
          [aliceLine, number],
        ),
      );
      const del = await db.as(alice, (c) =>
        c.query('delete from missed_call.blocked_numbers where line_id = $1 and number = $2', [
          aliceLine,
          number,
        ]),
      );
      expect(del.rowCount).toBe(0);
      await expect(
        db.as(alice, (c) =>
          c.query(
            "insert into missed_call.blocked_numbers (line_id, number, reason) values ($1, '+12395550662', 'opted_out')",
            [aliceLine],
          ),
        ),
      ).rejects.toSatisfy(isDenied);
      for (const reason of ['junk', 'manual']) {
        await db.as(alice, (c) =>
          c.query(
            'insert into missed_call.blocked_numbers (line_id, number, reason) values ($1, $2, $3)',
            [aliceLine, `+1239555066${reason === 'junk' ? 3 : 4}`, reason],
          ),
        );
      }
      const lifted = await db.asService((c) =>
        c.query('delete from missed_call.blocked_numbers where line_id = $1 and number = $2', [
          aliceLine,
          number,
        ]),
      );
      expect(lifted.rowCount).toBe(1);
    });

    it('owners can remove a junk block they added', async () => {
      if (!db) return;
      await db.as(alice, async (c) => {
        await c.query(
          "insert into missed_call.blocked_numbers (line_id, number, reason) values ($1, '+12395550665', 'junk')",
          [aliceLine],
        );
        const del = await c.query(
          "delete from missed_call.blocked_numbers where line_id = $1 and number = '+12395550665'",
          [aliceLine],
        );
        expect(del.rowCount).toBe(1);
      });
    });

    it('owners cannot verify their own cell; changing the cell clears the flag', async () => {
      if (!db) return;
      await expect(
        db.as(alice, (c) =>
          c.query('update missed_call.lines set owner_cell_verified = true where id = $1', [
            aliceLine,
          ]),
        ),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(alice, (c) =>
          c.query(
            `insert into missed_call.lines (owner_id, owner_cell, business_name, template, owner_cell_verified)
             values ($1, '+12395550105', 'Self Verified', 'hi', true)`,
            [alice.id],
          ),
        ),
      ).rejects.toSatisfy(isDenied);
      await db.asService((c) =>
        c.query('update missed_call.lines set owner_cell_verified = true where id = $1', [
          aliceLine,
        ]),
      );
      const stays = await db.asService((c) =>
        c.query<{ owner_cell_verified: boolean }>(
          "update missed_call.lines set template = 'New wording' where id = $1 returning owner_cell_verified",
          [aliceLine],
        ),
      );
      expect(stays.rows[0]?.owner_cell_verified).toBe(true);
      const cleared = await db.as(alice, (c) =>
        c.query<{ owner_cell_verified: boolean }>(
          "update missed_call.lines set owner_cell = '+12395550106' where id = $1 returning owner_cell_verified",
          [aliceLine],
        ),
      );
      expect(cleared.rows[0]?.owner_cell_verified).toBe(false);
    });
  },
);
