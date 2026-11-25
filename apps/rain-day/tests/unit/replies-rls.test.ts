import { connectTestDb, isDenied, type TestDb, type TestUser } from '@speedy/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * R4 database rules: replies, owner settings, phone verification state and the functions that
 * write them. Owner A never sees owner B's data; owners cannot forge any of it.
 */
let db: TestDb | null = null;
let alice: TestUser;
let bob: TestUser;
/** A fresh US-shaped number per call, so rows left by earlier runs never match. */
function freshPhone(): string {
  return `+12396${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
}
const INBOUND_ID = `SMin${crypto.randomUUID()}`;
const NOCELL_ID = `SMnocell${crypto.randomUUID()}`;
const CAP_RUN = crypto.randomUUID();
const SHARED_PHONE = freshPhone();
const PH311 = freshPhone();
const PH321 = freshPhone();
const PH331 = freshPhone();
const PH332 = freshPhone();
const PH399 = freshPhone();

const RECORD = 'select * from rain_day.record_reply($1, $2, $3, $4)';

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
    'insert into rain_day.owner_settings (owner_id, owner_cell, owner_cell_verified_at) values ($1, $2, now())',
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

describe.skipIf(!enabled)('rain_day R4 RLS', () => {
  it('owners read only their own replies and settings, and cannot write either', async () => {
    if (!db) return;
    const a = await seedSentMessage(alice, PH311, 'Ann', '2026-12-01T10:00:00Z');
    await verifiedCell(alice, '+12395550999');
    await db.asService((c) =>
      c.query(RECORD, [PH311, `SMrls${crypto.randomUUID()}`, 'Thursday?', 30]),
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
    await expect(
      db.pool.query(
        "insert into rain_day.owner_settings (owner_id, owner_cell) values ($1, '+12395550666')",
        [bob.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('verification state and the server functions are closed to owners and anon', async () => {
    if (!db) return;
    for (const table of ['phone_verifications', 'verification_sends']) {
      await expect(
        db.as(alice, (c) => c.query(`select * from rain_day.${table}`)),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(null, (c) => c.query(`select * from rain_day.${table}`)),
      ).rejects.toSatisfy(isDenied);
    }
    await expect(
      db.as(alice, (c) =>
        c.query('select rain_day.reserve_verification_send($1, 3, 3600)', [alice.id]),
      ),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) => c.query('select rain_day.consume_verification_attempt($1)', [alice.id])),
    ).rejects.toSatisfy(isDenied);
    await expect(db.as(alice, (c) => c.query(RECORD, [PH311, 'x', 'x', 30]))).rejects.toSatisfy(
      isDenied,
    );
    await expect(db.as(null, (c) => c.query(RECORD, [PH311, 'x', 'x', 30]))).rejects.toSatisfy(
      isDenied,
    );
  });

  it('reserve_verification_send allows 3 an hour per owner and the counts are separate', async () => {
    if (!db) return;
    const reserve = (u: TestUser) =>
      db!.asService(
        async (c) =>
          (await c.query('select rain_day.reserve_verification_send($1, 3, 3600) as ok', [u.id]))
            .rows[0].ok,
      );
    expect([
      await reserve(alice),
      await reserve(alice),
      await reserve(alice),
      await reserve(alice),
    ]).toEqual([true, true, true, false]);
    expect(await reserve(bob)).toBe(true);
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
});

describe.skipIf(!enabled)('rain_day.record_reply', () => {
  it('files a reply under the latest message to that phone, across owners, and marks it replied', async () => {
    if (!db) return;
    const phone = SHARED_PHONE;
    const old = await seedSentMessage(alice, phone, 'Maria', '2026-12-01T10:00:00Z');
    const recent = await seedSentMessage(bob, phone, 'Maria L', '2026-12-02T10:00:00Z');
    await verifiedCell(bob, '+12395550998');
    const res = await db.asService((c) =>
      c.query(RECORD, [phone, INBOUND_ID, 'Can you do Thursday?', 30]),
    );
    expect(res.rows[0]).toMatchObject({
      matched: true,
      duplicate: false,
      owner_id: bob.id,
      customer_name: 'Maria L',
      owner_cell: '+12395550998',
      forward: true,
    });
    const status = async (id: string) =>
      (await db!.pool.query('select status from rain_day.reschedule_messages where id = $1', [id]))
        .rows[0].status;
    expect(await status(recent.messageId)).toBe('replied');
    expect(await status(old.messageId)).toBe('sent');
  });

  it('a repeated provider id is a no-op: no second reply, no second forward', async () => {
    if (!db) return;
    const again = await db.asService((c) =>
      c.query(RECORD, [SHARED_PHONE, INBOUND_ID, 'Can you do Thursday?', 30]),
    );
    expect(again.rows[0]).toMatchObject({ matched: true, duplicate: true, forward: false });
    const n = await db.pool.query(
      'select count(*)::int as n from rain_day.replies where provider_message_id = $1',
      [INBOUND_ID],
    );
    expect(n.rows[0].n).toBe(1);
  });

  it('a number nobody texted matches nothing', async () => {
    if (!db) return;
    const res = await db.asService((c) =>
      c.query(RECORD, [PH399, `SMnone${crypto.randomUUID()}`, 'hello', 30]),
    );
    expect(res.rows[0]).toMatchObject({ matched: false, forward: false });
  });

  it('without a verified cell the reply is kept but not forwarded', async () => {
    if (!db) return;
    const owner = await db.createUser();
    await seedSentMessage(owner, PH321, 'Cal', '2026-12-03T10:00:00Z');
    const res = await db.asService((c) => c.query(RECORD, [PH321, NOCELL_ID, 'hi', 30]));
    expect(res.rows[0]).toMatchObject({ matched: true, forward: false, owner_cell: null });
    const row = await db.pool.query(
      'select forward_status from rain_day.replies where provider_message_id = $1',
      [NOCELL_ID],
    );
    expect(row.rows[0].forward_status).toBe('not_set_up');
  });

  it('caps forwards per owner per hour, still keeps every reply, and counts only this owner', async () => {
    if (!db) return;
    const owner = await db.createUser();
    const other = await db.createUser();
    await seedSentMessage(owner, PH331, 'Dee', '2026-12-03T10:00:00Z');
    await seedSentMessage(other, PH332, 'Eve', '2026-12-03T10:00:00Z');
    await verifiedCell(owner, '+12395550997');
    await verifiedCell(other, '+12395550996');
    const send = (phone: string, id: string) =>
      db!.asService(async (c) => (await c.query(RECORD, [phone, id, 'ok', 30])).rows[0]);
    const results = [];
    for (let i = 0; i < 32; i++) results.push(await send(PH331, `SMcap${CAP_RUN}${i}`));
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
    expect((await send(PH332, `SMother${CAP_RUN}`)).forward).toBe(true);
  });
});
