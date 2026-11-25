import { connectTestDb, isDenied, type TestDb, type TestUser } from '@speedy/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * R4 database rules: replies, owner settings, per-owner sender numbers, phone verification state
 * and the functions that write them. Owner A never sees, receives or changes owner B's data;
 * owners cannot forge any of it.
 */
let db: TestDb | null = null;
let alice: TestUser;
let bob: TestUser;

/** A fresh US-shaped number per call, so rows left by earlier runs never match. */
function freshPhone(): string {
  return `+12396${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
}

const RECORD = 'select * from rain_day.record_reply($1, $2, $3, $4, $5)';
const RESERVE = 'select rain_day.reserve_verification_send($1, 3, 3600, 6) as ok';
const TIMEOUT = { timeout: 60_000 };

async function seedSentMessage(owner: TestUser, phone: string, name: string, sentAt: string) {
  const pool = db!.pool;
  const c = await pool.query<{ id: string }>(
    'insert into rain_day.customers (owner_id, name, phone, service_day) values ($1, $2, $3, 2) returning id',
    [owner.id, name, phone],
  );
  const r = await pool.query<{ id: string }>(
    "insert into rain_day.reschedules (owner_id, from_date, to_date, template, idempotency_key) values ($1, '2026-12-01', '2026-12-02', 'x', gen_random_uuid()) returning id",
    [owner.id],
  );
  const m = await pool.query<{ id: string }>(
    "insert into rain_day.reschedule_messages (reschedule_id, customer_id, customer_name, body, status, provider, provider_message_id, sent_at) values ($1, $2, $3, 'Hi', 'sent', 'twilio', $4, $5) returning id",
    [r.rows[0]!.id, c.rows[0]!.id, name, `SM${crypto.randomUUID()}`, sentAt],
  );
  return { customerId: c.rows[0]!.id, messageId: m.rows[0]!.id };
}

async function verifiedCell(owner: TestUser, cell: string) {
  await db!.pool.query(
    'insert into rain_day.owner_settings (owner_id, owner_cell, owner_cell_verified_at) values ($1, $2, now()) on conflict (owner_id) do update set owner_cell = $2, owner_cell_verified_at = now()',
    [owner.id, cell],
  );
}

const enabled = Boolean(process.env.CI || process.env.DATABASE_URL || process.env.DB_TESTS);

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  alice = await db.createUser();
  bob = await db.createUser();
});

afterAll(async () => {
  await db?.close();
});

describe.skipIf(!enabled)('rain_day R4 RLS', TIMEOUT, () => {
  it('owners read only their own replies and settings, and cannot write either', async () => {
    if (!db) return;
    const phone = freshPhone();
    const a = await seedSentMessage(alice, phone, 'Ann', '2026-12-01T10:00:00Z');
    await verifiedCell(alice, '+12395550999');
    await db.asService((c) =>
      c.query(RECORD, [alice.id, phone, `SMrls${crypto.randomUUID()}`, 'Thursday?', 30]),
    );
    const mine = await db.as(alice, (c) => c.query('select customer_name from rain_day.replies'));
    expect(mine.rows).toEqual([{ customer_name: 'Ann' }]);
    expect((await db.as(bob, (c) => c.query('select * from rain_day.replies'))).rowCount).toBe(0);
    expect(
      (await db.as(bob, (c) => c.query('select * from rain_day.owner_settings'))).rowCount,
    ).toBe(0);
    expect(
      (await db.as(alice, (c) => c.query('select * from rain_day.owner_settings'))).rowCount,
    ).toBe(1);

    await expect(
      db.as(alice, (c) =>
        c.query(
          "update rain_day.owner_settings set owner_cell = '+12395550888' where owner_id = $1",
          [alice.id],
        ),
      ),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(bob, (c) =>
        c.query(
          "insert into rain_day.owner_settings (owner_id, owner_cell, owner_cell_verified_at) values ($1, '+12395550777', now())",
          [bob.id],
        ),
      ),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) =>
        c.query("update rain_day.replies set body = 'x' where customer_id = $1", [a.customerId]),
      ),
    ).rejects.toSatisfy(isDenied);
    await expect(db.as(alice, (c) => c.query('delete from rain_day.replies'))).rejects.toSatisfy(
      isDenied,
    );
  });

  it('an owner cell is never stored without its verified time', async () => {
    if (!db) return;
    const owner = await db.createUser();
    await expect(
      db.pool.query(
        "insert into rain_day.owner_settings (owner_id, owner_cell) values ($1, '+12395550666')",
        [owner.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('verification state and the server functions are closed to owners and anon', async () => {
    if (!db) return;
    for (const table of ['phone_verifications', 'verification_sends', 'help_replies']) {
      await expect(
        db.as(alice, (c) => c.query(`select * from rain_day.${table}`)),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(null, (c) => c.query(`select * from rain_day.${table}`)),
      ).rejects.toSatisfy(isDenied);
    }
    const args = [alice.id, '+12395550311', 'x', 'x', 30];
    await expect(db.as(alice, (c) => c.query(RESERVE, [alice.id]))).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) => c.query('select rain_day.consume_verification_attempt($1)', [alice.id])),
    ).rejects.toSatisfy(isDenied);
    await expect(db.as(alice, (c) => c.query(RECORD, args))).rejects.toSatisfy(isDenied);
    await expect(db.as(null, (c) => c.query(RECORD, args))).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) =>
        c.query('select rain_day.claim_help_reply($1, $2)', [alice.id, '+12395550311']),
      ),
    ).rejects.toSatisfy(isDenied);
  });
});

describe.skipIf(!enabled)('rain_day verification limits', TIMEOUT, () => {
  it('reserve_verification_send allows 3 an hour and 6 a day per owner, counted separately', async () => {
    if (!db) return;
    const reserve = (u: TestUser) =>
      db!.asService(async (c) => (await c.query(RESERVE, [u.id])).rows[0].ok as boolean);
    const first = await db.createUser();
    expect([
      await reserve(first),
      await reserve(first),
      await reserve(first),
      await reserve(first),
    ]).toEqual([true, true, true, false]);
    expect(await reserve(await db.createUser())).toBe(true);

    // Three codes already went out yesterday-ish (2 hours ago): the hour is clear, the day is not full.
    const second = await db.createUser();
    await db.pool.query(
      "insert into rain_day.verification_sends (owner_id, created_at) select $1, now() - interval '2 hours' from generate_series(1, 5)",
      [second.id],
    );
    expect(await reserve(second)).toBe(true); // 6th in 24 hours
    expect(await reserve(second)).toBe(false); // 7th: over the daily cap, though the hour is clear
  });

  it('consume_verification_attempt counts atomically and is null without a challenge', async () => {
    if (!db) return;
    const user = await db.createUser();
    const consume = () =>
      db!.asService(
        async (c) =>
          (await c.query('select rain_day.consume_verification_attempt($1) as n', [user.id]))
            .rows[0].n,
      );
    expect(await consume()).toBeNull();
    await db.pool.query(
      "insert into rain_day.phone_verifications (owner_id, phone, code_hash, salt, expires_at) values ($1, '+12395550123', 'h', 's', now() + interval '10 minutes')",
      [user.id],
    );
    const counts = await Promise.all([consume(), consume(), consume()]);
    expect(counts.sort()).toEqual([1, 2, 3]);
  });

  it('claim_help_reply is true once per owner and number per 24 hours, and never shared between owners', async () => {
    if (!db) return;
    const phone = freshPhone();
    const [one, two] = [await db.createUser(), await db.createUser()];
    const claim = (who: TestUser) =>
      db!.asService(
        async (c) =>
          (await c.query('select rain_day.claim_help_reply($1, $2) as ok', [who.id, phone])).rows[0]
            .ok as boolean,
      );
    expect([await claim(one), await claim(one)]).toEqual([true, false]);
    // The same number asking HELP at another owner's number gets its own answer.
    expect(await claim(two)).toBe(true);
    await db.pool.query(
      "update rain_day.help_replies set last_sent_at = now() - interval '25 hours' where owner_id = $1 and phone = $2",
      [one.id, phone],
    );
    expect(await claim(one)).toBe(true);
    expect(await claim(two)).toBe(false);
  });
});

describe.skipIf(!enabled)('rain_day.owner_settings sender_number', TIMEOUT, () => {
  const setSender = (owner: TestUser, number: string) =>
    db!.asService((c) =>
      c.query(
        'insert into rain_day.owner_settings (owner_id, sender_number) values ($1, $2) on conflict (owner_id) do update set sender_number = $2',
        [owner.id, number],
      ),
    );

  it('is set by the service role, read by its owner, and never writable by an owner', async () => {
    if (!db) return;
    const owner = await db.createUser();
    const number = freshPhone();
    await setSender(owner, number);
    const own = await db.as(owner, (c) =>
      c.query('select sender_number from rain_day.owner_settings'),
    );
    expect(own.rows).toEqual([{ sender_number: number }]);
    await expect(
      db.as(owner, (c) =>
        c.query('update rain_day.owner_settings set sender_number = $1 where owner_id = $2', [
          freshPhone(),
          owner.id,
        ]),
      ),
    ).rejects.toSatisfy(isDenied);
  });

  it('two owners can never share a number, and it must be a US E.164 number', async () => {
    if (!db) return;
    const [a, b] = [await db.createUser(), await db.createUser()];
    const number = freshPhone();
    await setSender(a, number);
    await expect(setSender(b, number)).rejects.toMatchObject({ code: '23505' });
    await expect(setSender(b, '239-555-0100')).rejects.toMatchObject({ code: '23514' });
  });
});

describe.skipIf(!enabled)('rain_day.owner_settings sender_messaging_service_sid', TIMEOUT, () => {
  const setService = (owner: TestUser, sid: string) =>
    db!.asService((c) =>
      c.query(
        'insert into rain_day.owner_settings (owner_id, sender_messaging_service_sid) values ($1, $2) on conflict (owner_id) do update set sender_messaging_service_sid = $2',
        [owner.id, sid],
      ),
    );
  const freshSid = () => `MG${crypto.randomUUID().replaceAll('-', '')}`;

  it('is set by the service role, read by its owner, and never writable by an owner', async () => {
    if (!db) return;
    const owner = await db.createUser();
    const sid = freshSid();
    await setService(owner, sid);
    const own = await db.as(owner, (c) =>
      c.query('select sender_messaging_service_sid as sid from rain_day.owner_settings'),
    );
    expect(own.rows).toEqual([{ sid }]);
    await expect(
      db.as(owner, (c) =>
        c.query(
          'update rain_day.owner_settings set sender_messaging_service_sid = $1 where owner_id = $2',
          [freshSid(), owner.id],
        ),
      ),
    ).rejects.toSatisfy(isDenied);
  });

  it('is an MG... SID, and two owners can never share a service', async () => {
    if (!db) return;
    const [one, two] = [await db.createUser(), await db.createUser()];
    const sid = freshSid();
    await setService(one, sid);
    await expect(setService(two, sid)).rejects.toMatchObject({ code: '23505' });
    await expect(setService(two, 'MGnothex')).rejects.toMatchObject({ code: '23514' });
    await expect(setService(two, `AC${sid.slice(2)}`)).rejects.toMatchObject({ code: '23514' });
  });
});

describe.skipIf(!enabled)('rain_day.record_reply', TIMEOUT, () => {
  it('matches only the owner who was texted: another owner with the same customer gets nothing', async () => {
    if (!db) return;
    const phone = freshPhone();
    const [owner, rival] = [await db.createUser(), await db.createUser()];
    const mine = await seedSentMessage(owner, phone, 'Maria', '2026-12-01T10:00:00Z');
    // The rival imported the same customer and texted them more recently.
    const theirs = await seedSentMessage(rival, phone, 'Maria L', '2026-12-02T10:00:00Z');
    await verifiedCell(owner, '+12395550998');
    await verifiedCell(rival, '+12395550995');

    const id = `SMin${crypto.randomUUID()}`;
    const res = await db.asService((c) =>
      c.query(RECORD, [owner.id, phone, id, 'Can you do Thursday?', 30]),
    );
    expect(res.rows[0]).toMatchObject({
      matched: true,
      duplicate: false,
      customer_name: 'Maria',
      owner_cell: '+12395550998',
      forward: true,
    });
    const status = async (messageId: string) =>
      (
        await db!.pool.query('select status from rain_day.reschedule_messages where id = $1', [
          messageId,
        ])
      ).rows[0].status;
    expect(await status(mine.messageId)).toBe('replied');
    expect(await status(theirs.messageId)).toBe('sent');
    const rivalReplies = await db.pool.query('select 1 from rain_day.replies where owner_id = $1', [
      rival.id,
    ]);
    expect(rivalReplies.rowCount).toBe(0);

    // And a repeated provider id is a no-op: no second reply, no second forward.
    const again = await db.asService((c) =>
      c.query(RECORD, [owner.id, phone, id, 'Can you do Thursday?', 30]),
    );
    expect(again.rows[0]).toMatchObject({ matched: true, duplicate: true, forward: false });
    const n = await db.pool.query(
      'select count(*)::int as n from rain_day.replies where provider_message_id = $1',
      [id],
    );
    expect(n.rows[0].n).toBe(1);
  });

  it('a number this owner never texted matches nothing', async () => {
    if (!db) return;
    const owner = await db.createUser();
    const res = await db.asService((c) =>
      c.query(RECORD, [owner.id, freshPhone(), `SMnone${crypto.randomUUID()}`, 'hello', 30]),
    );
    expect(res.rows[0]).toMatchObject({ matched: false, forward: false });
  });

  it('without a verified cell the reply is kept but not forwarded', async () => {
    if (!db) return;
    const owner = await db.createUser();
    const phone = freshPhone();
    await seedSentMessage(owner, phone, 'Cal', '2026-12-03T10:00:00Z');
    const id = `SMnocell${crypto.randomUUID()}`;
    const res = await db.asService((c) => c.query(RECORD, [owner.id, phone, id, 'hi', 30]));
    expect(res.rows[0]).toMatchObject({ matched: true, forward: false, owner_cell: null });
    const row = await db.pool.query(
      'select forward_status from rain_day.replies where provider_message_id = $1',
      [id],
    );
    expect(row.rows[0].forward_status).toBe('not_set_up');
  });

  it('caps forwards per owner per hour, still keeps every reply, and counts only this owner', async () => {
    if (!db) return;
    const [owner, other] = [await db.createUser(), await db.createUser()];
    const [p1, p2] = [freshPhone(), freshPhone()];
    await seedSentMessage(owner, p1, 'Dee', '2026-12-03T10:00:00Z');
    await seedSentMessage(other, p2, 'Eve', '2026-12-03T10:00:00Z');
    await verifiedCell(owner, '+12395550997');
    await verifiedCell(other, '+12395550996');
    const run = crypto.randomUUID();
    const send = (who: TestUser, phone: string, id: string) =>
      db!.asService(async (c) => (await c.query(RECORD, [who.id, phone, id, 'ok', 30])).rows[0]);
    const results = [];
    for (let i = 0; i < 32; i++) results.push(await send(owner, p1, `SMcap${run}${i}`));
    expect(results.filter((r) => r.forward)).toHaveLength(30);
    expect(results.slice(30).every((r) => !r.forward && !r.duplicate)).toBe(true);
    const stored = await db.pool.query(
      'select forward_status, count(*)::int as n from rain_day.replies where owner_id = $1 group by 1 order by 1',
      [owner.id],
    );
    expect(stored.rows).toEqual([
      { forward_status: 'capped', n: 2 },
      { forward_status: 'pending', n: 30 },
    ]);
    expect((await send(other, p2, `SMother${run}`)).forward).toBe(true);
  });

  it('contacted_customers lists only the caller’s customers who got a text', async () => {
    if (!db) return;
    const [owner, stranger] = [await db.createUser(), await db.createUser()];
    const seeded = await seedSentMessage(owner, freshPhone(), 'Zoe', '2026-12-03T10:00:00Z');
    const mine = await db.as(owner, (c) => c.query('select * from rain_day.contacted_customers()'));
    expect(mine.rows.map((r) => r.contacted_customers)).toEqual([seeded.customerId]);
    expect(
      (await db.as(stranger, (c) => c.query('select * from rain_day.contacted_customers()')))
        .rowCount,
    ).toBe(0);
  });
});
