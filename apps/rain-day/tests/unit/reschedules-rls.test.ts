import { connectTestDb, isDenied, type TestDb, type TestUser } from '@speedy/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * rain_day.reschedules and reschedule_messages RLS, plus create_reschedule's idempotency.
 * Runs with DB_TESTS=1 and DATABASE_URL (or CI).
 */
let db: TestDb | null = null;
let alice: TestUser;
let bob: TestUser;
let aliceCustomer: string;
let bobCustomer: string;
let bobReschedule: string;

/** A fresh US-shaped number per call, so rows left by earlier runs never collide. */
function freshPhone(): string {
  return `+12398${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
}

const NEW_CUSTOMER =
  'insert into rain_day.customers (owner_id, name, phone, service_day) values ($1, $2, $3, 2) returning id';
const CREATE = 'select * from rain_day.create_reschedule($1, $2, $3, $4, $5::jsonb)';

function messages(customerId: string, status = 'queued') {
  return JSON.stringify([
    { customer_id: customerId, customer_name: 'Maria Lopez', body: 'Hi Maria', status },
  ]);
}

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  alice = await db.createUser();
  bob = await db.createUser();
  aliceCustomer = await db.asCommitted(
    alice,
    async (c) =>
      (await c.query<{ id: string }>(NEW_CUSTOMER, [alice.id, 'Maria', '+12395550201'])).rows[0]!
        .id,
  );
  bobCustomer = await db.asCommitted(
    bob,
    async (c) =>
      (await c.query<{ id: string }>(NEW_CUSTOMER, [bob.id, 'Pat', '+12395550202'])).rows[0]!.id,
  );
  bobReschedule = await db.asCommitted(
    bob,
    async (c) =>
      (
        await c.query<{ reschedule_id: string }>(CREATE, [
          crypto.randomUUID(),
          '2026-12-01',
          '2026-12-02',
          'Hi {first_name}',
          messages(bobCustomer),
        ])
      ).rows[0]!.reschedule_id,
  );
});

afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'rain_day reschedules RLS',
  { timeout: 60_000 },
  () => {
    it('create_reschedule makes one rain day with its messages, once per key', async () => {
      if (!db) return;
      const key = crypto.randomUUID();
      const args = [key, '2026-12-01', '2026-12-02', 'Hi {first_name}', messages(aliceCustomer)];
      const first = await db.asCommitted(alice, (c) => c.query(CREATE, args));
      const second = await db.asCommitted(alice, (c) => c.query(CREATE, args));
      expect(first.rows[0]).toMatchObject({ created: true });
      expect(second.rows[0]).toEqual({
        reschedule_id: first.rows[0].reschedule_id,
        created: false,
      });
      const count = await db.as(alice, (c) =>
        c.query(
          'select count(*)::int as n from rain_day.reschedule_messages where reschedule_id = $1',
          [first.rows[0].reschedule_id],
        ),
      );
      expect(count.rows[0]).toEqual({ n: 1 });
    });

    it('rejects an empty message list and a rain day onto the same date', async () => {
      if (!db) return;
      await expect(
        db.as(alice, (c) =>
          c.query(CREATE, [crypto.randomUUID(), '2026-12-01', '2026-12-02', 'x', '[]']),
        ),
      ).rejects.toMatchObject({ code: '22023' });
      await expect(
        db.as(alice, (c) =>
          c.query(CREATE, [
            crypto.randomUUID(),
            '2026-12-01',
            '2026-12-01',
            'x',
            messages(aliceCustomer),
          ]),
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('an owner reads only their own rain days and messages', async () => {
      if (!db) return;
      const r = await db.as(alice, (c) => c.query('select id from rain_day.reschedules'));
      expect(r.rows.map((x) => x.id)).not.toContain(bobReschedule);
      const m = await db.as(alice, (c) =>
        c.query('select id from rain_day.reschedule_messages where reschedule_id = $1', [
          bobReschedule,
        ]),
      );
      expect(m.rowCount).toBe(0);
      const bobs = await db.as(bob, (c) =>
        c.query('select id from rain_day.reschedule_messages where reschedule_id = $1', [
          bobReschedule,
        ]),
      );
      expect(bobs.rowCount).toBe(1);
    });

    it('an owner cannot send to another owner’s customer or into their rain day', async () => {
      if (!db) return;
      await expect(
        db.as(alice, (c) =>
          c.query(CREATE, [
            crypto.randomUUID(),
            '2026-12-01',
            '2026-12-02',
            'x',
            messages(bobCustomer),
          ]),
        ),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(alice, (c) =>
          c.query(
            "insert into rain_day.reschedule_messages (reschedule_id, customer_id, customer_name, body) values ($1, $2, 'x', 'x')",
            [bobReschedule, aliceCustomer],
          ),
        ),
      ).rejects.toSatisfy(isDenied);
    });
  },
);

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'rain_day reschedules RLS: writes',
  { timeout: 60_000 },
  () => {
    it('owners cannot edit or delete sends, and a message cannot be created already marked sent', async () => {
      if (!db) return;
      await expect(
        db.as(bob, (c) =>
          c.query(
            "update rain_day.reschedule_messages set status = 'delivered' where reschedule_id = $1",
            [bobReschedule],
          ),
        ),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(bob, (c) =>
          c.query('delete from rain_day.reschedule_messages where reschedule_id = $1', [
            bobReschedule,
          ]),
        ),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(bob, (c) =>
          c.query("update rain_day.reschedules set template = 'x' where id = $1", [bobReschedule]),
        ),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(bob, (c) =>
          c.query('delete from rain_day.reschedules where id = $1', [bobReschedule]),
        ),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(bob, (c) =>
          c.query(CREATE, [
            crypto.randomUUID(),
            '2026-12-01',
            '2026-12-02',
            'x',
            messages(bobCustomer, 'sent'),
          ]),
        ),
      ).rejects.toMatchObject({ code: '22023', message: 'invalid_message' });
    });

    it('anon sees nothing and cannot call create_reschedule', async () => {
      if (!db) return;
      await expect(
        db.as(null, (c) => c.query('select * from rain_day.reschedules')),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(null, (c) => c.query('select * from rain_day.reschedule_messages')),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(null, (c) =>
          c.query(CREATE, [
            crypto.randomUUID(),
            '2026-12-01',
            '2026-12-02',
            'x',
            messages(bobCustomer),
          ]),
        ),
      ).rejects.toSatisfy(isDenied);
    });

    it('the service role can update status; owners see the change', async () => {
      if (!db) return;
      const id = `SM${crypto.randomUUID().replaceAll('-', '')}`;
      await db.asService((c) =>
        c.query(
          "update rain_day.reschedule_messages set status = 'sent', provider = 'twilio', provider_message_id = $1 where reschedule_id = $2",
          [id, bobReschedule],
        ),
      );
      const row = await db.as(bob, (c) =>
        c.query('select status from rain_day.reschedule_messages where provider_message_id = $1', [
          id,
        ]),
      );
      expect(row.rows).toEqual([{ status: 'sent' }]);
    });
  },
);

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'rain_day reschedule_messages provider ids',
  { timeout: 60_000 },
  () => {
    it('a provider message id needs its provider, and is unique per real provider only', async () => {
      if (!db) return;
      const owner = await db.createUser();
      const customer = await db.asCommitted(
        owner,
        async (c) =>
          (await c.query<{ id: string }>(NEW_CUSTOMER, [owner.id, 'Zed', freshPhone()])).rows[0]!
            .id,
      );
      const resched = await db.asCommitted(
        owner,
        async (c) =>
          (
            await c.query<{ reschedule_id: string }>(CREATE, [
              crypto.randomUUID(),
              '2026-12-01',
              '2026-12-02',
              'x',
              messages(customer),
            ])
          ).rows[0]!.reschedule_id,
      );
      const other = await db.pool.query<{ id: string }>(
        "insert into rain_day.customers (owner_id, name, phone, service_day) values ($1, 'Yan', $2, 2) returning id",
        [owner.id, freshPhone()],
      );
      const insert = (provider: string | null, id: string, customerId: string) =>
        db!.pool.query(
          "insert into rain_day.reschedule_messages (reschedule_id, customer_id, customer_name, body, status, provider, provider_message_id) values ($1, $2, 'n', 'b', 'sent', $3, $4)",
          [resched, customerId, provider, id],
        );
      const sid = `SM${crypto.randomUUID()}`;
      await expect(insert(null, sid, other.rows[0]!.id)).rejects.toMatchObject({ code: '23514' });
      await db.pool.query(
        "update rain_day.reschedule_messages set provider = 'twilio', provider_message_id = $1, status = 'sent' where reschedule_id = $2",
        [sid, resched],
      );
      await expect(insert('twilio', sid, other.rows[0]!.id)).rejects.toMatchObject({
        code: '23505',
      });
      // The same id under another provider is a different message.
      await insert('telnyx', sid, other.rows[0]!.id);
    });

    it('the fake provider may repeat ids (its counter restarts on every boot)', async () => {
      if (!db) return;
      const owner = await db.createUser();
      const phones = [freshPhone(), freshPhone()];
      const ids: string[] = [];
      for (const [i, phone] of phones.entries()) {
        ids.push(
          (
            await db.pool.query<{ id: string }>(
              'insert into rain_day.customers (owner_id, name, phone, service_day) values ($1, $2, $3, 2) returning id',
              [owner.id, `Fake${i}`, phone],
            )
          ).rows[0]!.id,
        );
      }
      const resched = await db.asCommitted(
        owner,
        async (c) =>
          (
            await c.query<{ reschedule_id: string }>(CREATE, [
              crypto.randomUUID(),
              '2026-12-01',
              '2026-12-02',
              'x',
              JSON.stringify(
                ids.map((id, i) => ({
                  customer_id: id,
                  customer_name: `Fake${i}`,
                  body: 'Hi',
                  status: 'queued',
                })),
              ),
            ])
          ).rows[0]!.reschedule_id,
      );
      const res = await db.pool.query(
        "update rain_day.reschedule_messages set provider = 'fake', provider_message_id = 'FAKE0001', status = 'sent' where reschedule_id = $1",
        [resched],
      );
      expect(res.rowCount).toBe(2);
    });
  },
);

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'rain_day create_reschedule limits and validation',
  { timeout: 60_000 },
  () => {
    async function ownerWithCustomers(n: number) {
      const owner = await db!.createUser();
      await db!.pool.query(
        "insert into rain_day.customers (owner_id, name, phone, service_day) select $1, 'C' || g, '+12399' || lpad(g::text, 6, '0'), 2 from generate_series(1, $2) g on conflict do nothing",
        [owner.id, n],
      );
      const { rows } = await db!.pool.query<{ id: string }>(
        'select id from rain_day.customers where owner_id = $1',
        [owner.id],
      );
      return { owner, ids: rows.map((r) => r.id) };
    }
    const batch = (ids: string[], extra: Record<string, unknown> = {}) =>
      JSON.stringify(
        ids.map((id, i) => ({
          customer_id: id,
          customer_name: `C${i}`,
          body: 'Hi',
          status: 'queued',
          ...extra,
        })),
      );
    const create = (owner: TestUser, key: string, json: string) =>
      db!.asCommitted(owner, (c) => c.query(CREATE, [key, '2026-12-01', '2026-12-02', 'x', json]));

    it('allows 3 rain days a day, refuses the 4th, and still answers a repeat of an earlier one', async () => {
      if (!db) return;
      const { owner, ids } = await ownerWithCustomers(2);
      const keys = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      for (const key of keys) await create(owner, key, batch(ids.slice(0, 1)));
      await expect(
        create(owner, crypto.randomUUID(), batch(ids.slice(0, 1))),
      ).rejects.toMatchObject({
        message: 'daily_limit_rain_days',
      });
      const repeat = await create(owner, keys[0]!, batch(ids.slice(0, 1)));
      expect(repeat.rows[0]).toMatchObject({ created: false });
    });

    it('caps texts at 1,000 a day per owner; skipped rows do not count', async () => {
      if (!db) return;
      const { owner, ids } = await ownerWithCustomers(1001);
      expect(ids).toHaveLength(1001);
      await expect(create(owner, crypto.randomUUID(), batch(ids))).rejects.toMatchObject({
        message: 'daily_limit_messages',
      });
      const first = await create(owner, crypto.randomUUID(), batch(ids.slice(0, 1000)));
      expect(first.rows[0]).toMatchObject({ created: true });
      await expect(
        create(owner, crypto.randomUUID(), batch(ids.slice(0, 1))),
      ).rejects.toMatchObject({
        message: 'daily_limit_messages',
      });
      // A rain day made only of skipped rows costs nothing against the cap.
      const skipped = await create(
        owner,
        crypto.randomUUID(),
        batch(ids.slice(0, 5), { status: 'skipped', error_code: 'opted_out' }),
      );
      expect(skipped.rows[0]).toMatchObject({ created: true });
    });

    it('limits are per owner', async () => {
      if (!db) return;
      const a = await ownerWithCustomers(1);
      const b = await ownerWithCustomers(1);
      for (let i = 0; i < 3; i++) await create(a.owner, crypto.randomUUID(), batch(a.ids));
      const fresh = await create(b.owner, crypto.randomUUID(), batch(b.ids));
      expect(fresh.rows[0]).toMatchObject({ created: true });
    });

    it('rejects a bad status, an over-long body and an unknown reason', async () => {
      if (!db) return;
      const { owner, ids } = await ownerWithCustomers(1);
      for (const bad of [
        { status: 'delivered' },
        { status: 'replied' },
        { body: 'x'.repeat(481) },
        { body: '' },
        { error_code: 'whatever' },
      ]) {
        await expect(create(owner, crypto.randomUUID(), batch(ids, bad))).rejects.toMatchObject({
          code: '22023',
        });
      }
      const ok = await create(owner, crypto.randomUUID(), batch(ids, { body: 'x'.repeat(480) }));
      expect(ok.rows[0]).toMatchObject({ created: true });
    });

    it('previously_texted lists customers who got an earlier text, for the caller only', async () => {
      if (!db) return;
      const { owner, ids } = await ownerWithCustomers(2);
      const stranger = await db.createUser();
      const first = await create(owner, crypto.randomUUID(), batch(ids));
      await db.pool.query(
        "update rain_day.reschedule_messages set status = 'sent', provider = 'twilio', provider_message_id = $2 where reschedule_id = $1 and customer_id = $3",
        [first.rows[0].reschedule_id, `SM${crypto.randomUUID()}`, ids[0]],
      );
      const second = await create(owner, crypto.randomUUID(), batch(ids));
      const asOwner = await db.as(owner, (c) =>
        c.query('select * from rain_day.previously_texted($1)', [second.rows[0].reschedule_id]),
      );
      expect(asOwner.rows.map((r) => r.previously_texted)).toEqual([ids[0]]);
      const asStranger = await db.as(stranger, (c) =>
        c.query('select * from rain_day.previously_texted($1)', [second.rows[0].reschedule_id]),
      );
      expect(asStranger.rowCount).toBe(0);
    });
  },
);

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'rain_day.opt_outs',
  { timeout: 60_000 },
  () => {
    const optOut = (owner: TestUser, phone: string) =>
      db!.asService((c) =>
        c.query('insert into rain_day.opt_outs (owner_id, phone) values ($1, $2)', [
          owner.id,
          phone,
        ]),
      );

    it('owners read their own opt-outs and can neither write, change nor delete them', async () => {
      if (!db) return;
      const owner = await db.createUser();
      const stranger = await db.createUser();
      const phone = freshPhone();
      await optOut(owner, phone);
      const own = await db.as(owner, (c) => c.query('select phone from rain_day.opt_outs'));
      expect(own.rows).toEqual([{ phone }]);
      expect(
        (await db.as(stranger, (c) => c.query('select * from rain_day.opt_outs'))).rowCount,
      ).toBe(0);

      await expect(
        db.as(owner, (c) => c.query('delete from rain_day.opt_outs where phone = $1', [phone])),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(owner, (c) =>
          c.query("update rain_day.opt_outs set phone = '+12395550000' where phone = $1", [phone]),
        ),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(stranger, (c) =>
          c.query('insert into rain_day.opt_outs (owner_id, phone) values ($1, $2)', [
            stranger.id,
            freshPhone(),
          ]),
        ),
      ).rejects.toSatisfy(isDenied);
      await expect(
        db.as(null, (c) => c.query('select * from rain_day.opt_outs')),
      ).rejects.toSatisfy(isDenied);
    });

    it('one opt-out per owner and number', async () => {
      if (!db) return;
      const owner = await db.createUser();
      const phone = freshPhone();
      await optOut(owner, phone);
      await expect(optOut(owner, phone)).rejects.toMatchObject({ code: '23505' });
    });

    it('deleting and re-importing a customer does not clear the opt-out', async () => {
      if (!db) return;
      const owner = await db.createUser();
      const phone = freshPhone();
      await db.asCommitted(owner, (c) => c.query(NEW_CUSTOMER, [owner.id, 'Maria', phone]));
      await optOut(owner, phone);
      await db.asCommitted(owner, (c) =>
        c.query('delete from rain_day.customers where owner_id = $1', [owner.id]),
      );
      await db.asCommitted(owner, (c) => c.query(NEW_CUSTOMER, [owner.id, 'Maria again', phone]));
      const still = await db.as(owner, (c) =>
        c.query('select 1 from rain_day.opt_outs where phone = $1', [phone]),
      );
      expect(still.rowCount).toBe(1);
    });

    it('customers no longer carry an opted_out column an owner could edit', async () => {
      if (!db) return;
      const cols = await db.pool.query(
        "select 1 from information_schema.columns where table_schema = 'rain_day' and table_name = 'customers' and column_name = 'opted_out'",
      );
      expect(cols.rowCount).toBe(0);
      const owner = await db.createUser();
      await expect(
        db.as(owner, (c) =>
          c.query(
            'insert into rain_day.customers (owner_id, name, phone, service_day, opted_out) values ($1, $2, $3, 2, false)',
            [owner.id, 'X', freshPhone()],
          ),
        ),
      ).rejects.toMatchObject({ code: '42703' });
    });
  },
);
