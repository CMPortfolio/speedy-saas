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
  () => {
    it('owners cannot edit or delete sends, and cannot insert a message already marked sent', async () => {
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
      ).rejects.toSatisfy(isDenied);
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

    it('the service role can update status, and one provider id maps to one message', async () => {
      if (!db) return;
      const id = `SM${crypto.randomUUID().replaceAll('-', '')}`;
      await db.asService((c) =>
        c.query(
          "update rain_day.reschedule_messages set status = 'sent', provider_message_id = $1 where reschedule_id = $2",
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
