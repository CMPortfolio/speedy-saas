import { connectTestDb, isDenied, type TestDb, type TestUser } from '@speedy/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * rain_day.customers RLS, through the shared harness (DATABASE_URL + DB_TESTS=1, or CI).
 * Owner A never sees, changes or deletes owner B's customers; anonymous callers see nothing.
 */
let db: TestDb | null = null;
let alice: TestUser;
let bob: TestUser;
let bobsCustomerId: string;

const INSERT =
  'insert into rain_day.customers (owner_id, name, phone, service_day, note) values ($1, $2, $3, $4, $5) returning id';

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  alice = await db.createUser();
  bob = await db.createUser();
  bobsCustomerId = await db.asCommitted(bob, async (c) => {
    const res = await c.query<{ id: string }>(INSERT, [
      bob.id,
      'Bob Customer',
      '+12395550101',
      2,
      null,
    ]);
    return res.rows[0]!.id;
  });
  await db.asCommitted(alice, (c) =>
    c.query(INSERT, [alice.id, 'Maria Lopez', '+12395550123', 2, 'back gate']),
  );
});

afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'rain_day.customers RLS',
  { timeout: 60_000 },
  () => {
    it('an owner reads only their own customers', async () => {
      if (!db) return;
      const mine = await db.as(alice, (c) => c.query('select name from rain_day.customers'));
      expect(mine.rows).toEqual([{ name: 'Maria Lopez' }]);
      const theirs = await db.as(alice, (c) =>
        c.query('select id from rain_day.customers where id = $1', [bobsCustomerId]),
      );
      expect(theirs.rowCount).toBe(0);
    });

    it('an owner cannot update or delete another owner’s customer', async () => {
      if (!db) return;
      const updated = await db.as(alice, (c) =>
        c.query("update rain_day.customers set name = 'hacked' where id = $1", [bobsCustomerId]),
      );
      expect(updated.rowCount).toBe(0);
      const deleted = await db.as(alice, (c) =>
        c.query('delete from rain_day.customers where id = $1', [bobsCustomerId]),
      );
      expect(deleted.rowCount).toBe(0);
      const still = await db.as(bob, (c) =>
        c.query('select name from rain_day.customers where id = $1', [bobsCustomerId]),
      );
      expect(still.rows).toEqual([{ name: 'Bob Customer' }]);
    });

    it('an owner cannot insert a customer for someone else', async () => {
      if (!db) return;
      await expect(
        db.as(alice, (c) => c.query(INSERT, [bob.id, 'Sneaky', '+12395550144', 1, null])),
      ).rejects.toSatisfy(isDenied);
    });

    it('anon reads nothing and cannot insert', async () => {
      if (!db) return;
      const rows = await db.as(null, (c) => c.query('select * from rain_day.customers'));
      expect(rows.rowCount).toBe(0);
      await expect(
        db.as(null, (c) => c.query(INSERT, [alice.id, 'Anon', '+12395550155', 1, null])),
      ).rejects.toSatisfy(isDenied);
    });

    it('owners may edit their own rows and updated_at moves', async () => {
      if (!db) return;
      const res = await db.as(alice, (c) =>
        c.query<{ moved: boolean; note: string }>(
          "update rain_day.customers set note = 'side gate', updated_at = '2000-01-01' where phone = '+12395550123' returning updated_at > created_at as moved, note",
        ),
      );
      // The trigger overrides the stale updated_at we tried to write.
      expect(res.rows[0]).toEqual({ moved: true, note: 'side gate' });
    });

    it('one phone per owner, and only E.164 US numbers or days 0–6', async () => {
      if (!db) return;
      await expect(
        db.as(alice, (c) => c.query(INSERT, [alice.id, 'Maria Again', '+12395550123', 3, null])),
      ).rejects.toMatchObject({ code: '23505' });
      // The same number is fine for a different owner.
      const bobs = await db.as(bob, (c) =>
        c.query(INSERT, [bob.id, 'Maria Lopez', '+12395550123', 3, null]),
      );
      expect(bobs.rowCount).toBe(1);
      await expect(
        db.as(alice, (c) => c.query(INSERT, [alice.id, 'Raw', '239-555-0166', 3, null])),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        db.as(alice, (c) => c.query(INSERT, [alice.id, 'Day 7', '+12395550166', 7, null])),
      ).rejects.toMatchObject({ code: '23514' });
    });
  },
);
