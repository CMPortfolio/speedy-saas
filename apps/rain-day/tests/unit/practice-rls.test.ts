import { connectTestDb, isDenied, type TestDb, type TestUser } from '@speedy/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * rain_day practice tables: an owner reads only their own practice rows and can neither write
 * nor call the server functions; the functions refuse another owner's customer or practice rain
 * day; anonymous callers get nothing.
 */
let db: TestDb | null = null;
let alice: TestUser;
let bob: TestUser;
let aliceDay: string;
let aliceCustomer: string;
let bobCustomer: string;

function freshPhone(): string {
  return `+12395${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
}

const enabled = Boolean(process.env.CI || process.env.DATABASE_URL || process.env.DB_TESTS);
const CREATE =
  'select * from rain_day.create_practice_reschedule($1, $2, $3, $4, $5, $6::jsonb, $7)';
const skipped = (customerId: string) =>
  JSON.stringify([{ customer_id: customerId, status: 'skipped', error_code: 'opted_out' }]);

async function customerFor(owner: TestUser, name: string): Promise<string> {
  const res = await db!.pool.query<{ id: string }>(
    'insert into rain_day.customers (owner_id, name, phone, service_day) values ($1, $2, $3, 2) returning id',
    [owner.id, name, freshPhone()],
  );
  return res.rows[0]!.id;
}

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  alice = await db.createUser();
  bob = await db.createUser();
  aliceCustomer = await customerFor(alice, 'Maria');
  bobCustomer = await customerFor(bob, 'Pat');
  const made = await db.asService((c) =>
    c.query<{ reschedule_id: string }>(CREATE, [
      alice.id,
      crypto.randomUUID(),
      '2026-12-01',
      '2026-12-02',
      'Hi {first_name}',
      skipped(aliceCustomer),
      100,
    ]),
  );
  aliceDay = made.rows[0]!.reschedule_id;
  await db.pool.query(
    'insert into rain_day.practice_opt_outs (owner_id, customer_id) values ($1, $2)',
    [alice.id, aliceCustomer],
  );
});

afterAll(async () => {
  await db?.close();
});

describe.skipIf(!enabled)('rain_day practice RLS', { timeout: 60_000 }, () => {
  it('an owner reads only their own practice rain days, bubbles and opt-outs', async () => {
    if (!db) return;
    for (const table of ['practice_reschedules', 'practice_messages', 'practice_opt_outs']) {
      const mine = await db.as(alice, (c) => c.query(`select * from rain_day.${table}`));
      expect(mine.rowCount).toBe(1);
      const theirs = await db.as(bob, (c) => c.query(`select * from rain_day.${table}`));
      expect(theirs.rowCount).toBe(0);
    }
  });

  it('a practice bubble holds the customer by id and no name or number', async () => {
    if (!db) return;
    const cols = await db.pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'rain_day' and table_name = 'practice_messages'",
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).toContain('customer_id');
    expect(names).not.toContain('customer_name');
    expect(names).not.toContain('phone');
  });

  it('owners cannot write, change or delete practice rows', async () => {
    if (!db) return;
    await expect(
      db.as(alice, (c) =>
        c.query(
          "insert into rain_day.practice_reschedules (owner_id, from_date, to_date, template, idempotency_key) values ($1, '2026-12-05', '2026-12-06', 'x', gen_random_uuid())",
          [alice.id],
        ),
      ),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) =>
        c.query(
          "insert into rain_day.practice_messages (owner_id, practice_reschedule_id, customer_id, direction, body) values ($1, $2, $3, 'out', 'x')",
          [alice.id, aliceDay, aliceCustomer],
        ),
      ),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) => c.query("update rain_day.practice_messages set body = 'changed'")),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) => c.query('delete from rain_day.practice_messages')),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) => c.query('delete from rain_day.practice_opt_outs')),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(alice, (c) => c.query("update rain_day.practice_reschedules set template = 'x'")),
    ).rejects.toSatisfy(isDenied);
  });

  it('the rate-limit table and the server functions are closed to owners and anonymous callers', async () => {
    if (!db) return;
    await expect(
      db.as(alice, (c) => c.query('select * from rain_day.practice_actions')),
    ).rejects.toSatisfy(isDenied);
    await expect(
      db.as(null, (c) => c.query('select * from rain_day.practice_messages')),
    ).rejects.toSatisfy(isDenied);
    const calls: [string, unknown[]][] = [
      ['select rain_day.reserve_practice_action($1, 60, 3600)', [alice.id]],
      ['select rain_day.clear_practice($1)', [bob.id]],
      ['select rain_day.expire_practice($1)', [bob.id]],
      [
        'select rain_day.add_practice_out($1, $2, $3, $4, 10)',
        [alice.id, aliceDay, aliceCustomer, 'hi'],
      ],
      [
        "select rain_day.add_practice_rows($1, $2, $3, '[]'::jsonb, false, 10)",
        [alice.id, aliceDay, aliceCustomer],
      ],
      [
        CREATE.replace('select * from ', 'select '),
        [
          alice.id,
          crypto.randomUUID(),
          '2026-12-01',
          '2026-12-02',
          'x',
          skipped(aliceCustomer),
          10,
        ],
      ],
    ];
    for (const [sql, args] of calls) {
      await expect(db.as(alice, (c) => c.query(sql, args))).rejects.toSatisfy(isDenied);
      await expect(db.as(null, (c) => c.query(sql, args))).rejects.toSatisfy(isDenied);
    }
  });
});

describe.skipIf(!enabled)('rain_day practice functions', { timeout: 60_000 }, () => {
  const rows = (
    customerId: string,
    n: number,
    status = 'queued',
    extra: Record<string, unknown> = {},
  ) =>
    JSON.stringify(
      Array.from({ length: n }, () => ({
        customer_id: customerId,
        status,
        error_code: null,
        ...extra,
      })),
    );
  const make = (owner: TestUser, key: string, json: string, max = 5) =>
    db!.asService((c) =>
      c.query(CREATE, [owner.id, key, '2026-12-01', '2026-12-02', 'x', json, max]),
    );

  it('create_practice_reschedule is once per key, capped, and checks its input', async () => {
    if (!db) return;
    const owner = await db.createUser();
    const customer = await customerFor(owner, 'Cap');
    const key = crypto.randomUUID();
    const first = await make(owner, key, rows(customer, 3));
    const again = await make(owner, key, rows(customer, 3));
    expect(first.rows[0]).toMatchObject({ created: true });
    expect(again.rows[0]).toEqual({ reschedule_id: first.rows[0].reschedule_id, created: false });
    // Only the skipped ones are filed here; the rest are added as they are "sent".
    const stored = await db.pool.query(
      'select count(*)::int as n from rain_day.practice_messages where owner_id = $1',
      [owner.id],
    );
    expect(stored.rows[0].n).toBe(0);
    await make(owner, crypto.randomUUID(), rows(customer, 2, 'skipped'));
    // The cap counts everything that will be added: 2 skipped are there, 3 more do not fit in 5.
    await expect(make(owner, crypto.randomUUID(), rows(customer, 4))).rejects.toMatchObject({
      message: 'practice_full',
    });
    for (const bad of [{ status: 'delivered' }, { status: 'sent' }, { error_code: 'whatever' }]) {
      await expect(
        make(owner, crypto.randomUUID(), rows(customer, 1, 'queued', bad)),
      ).rejects.toMatchObject({ code: '22023' });
    }
    await expect(make(owner, crypto.randomUUID(), '[]')).rejects.toMatchObject({ code: '22023' });
  });

  it('every function refuses another owner’s customer or practice rain day', async () => {
    if (!db) return;
    await expect(make(alice, crypto.randomUUID(), rows(bobCustomer, 1))).rejects.toMatchObject({
      code: '22023',
    });
    const out = (owner: TestUser, day: string, customer: string) =>
      db!.asService((c) =>
        c.query('select rain_day.add_practice_out($1, $2, $3, $4, 10)', [
          owner.id,
          day,
          customer,
          'hi',
        ]),
      );
    await expect(out(alice, aliceDay, bobCustomer)).rejects.toMatchObject({ code: '22023' });
    await expect(out(bob, aliceDay, bobCustomer)).rejects.toMatchObject({ code: '22023' });
    await expect(out(bob, aliceDay, aliceCustomer)).rejects.toMatchObject({ code: '22023' });
    const rowsFor = (owner: TestUser, day: string, customer: string) =>
      db!.asService((c) =>
        c.query(
          `select rain_day.add_practice_rows($1, $2, $3, '[{"direction":"in","kind":"text","body":"hi","status":"received"}]'::jsonb, false, 10)`,
          [owner.id, day, customer],
        ),
      );
    await expect(rowsFor(alice, aliceDay, bobCustomer)).rejects.toMatchObject({ code: '22023' });
    await expect(rowsFor(bob, aliceDay, bobCustomer)).rejects.toMatchObject({ code: '22023' });
    const leaked = await db.pool.query(
      'select 1 from rain_day.practice_messages where owner_id = $1',
      [bob.id],
    );
    expect(leaked.rowCount).toBe(0);
  });
});

describe.skipIf(!enabled)(
  'rain_day practice functions: out bubbles and expiry',
  { timeout: 60_000 },
  () => {
    const rows = (customerId: string, n: number, status = 'queued') =>
      JSON.stringify(
        Array.from({ length: n }, () => ({ customer_id: customerId, status, error_code: null })),
      );
    const make = (owner: TestUser, key: string, json: string, max = 5) =>
      db!.asService((c) =>
        c.query(CREATE, [owner.id, key, '2026-12-01', '2026-12-02', 'x', json, max]),
      );

    it('add_practice_out files one bubble, within the cap, and checks the body', async () => {
      if (!db) return;
      const owner = await db.createUser();
      const customer = await customerFor(owner, 'Out');
      const day = (await make(owner, crypto.randomUUID(), rows(customer, 1))).rows[0]
        .reschedule_id as string;
      const out = (body: string, max: number) =>
        db!.asService((c) =>
          c.query('select rain_day.add_practice_out($1, $2, $3, $4, $5) as id', [
            owner.id,
            day,
            customer,
            body,
            max,
          ]),
        );
      expect((await out('Hi', 2)).rows[0].id).toBeTruthy();
      expect((await out('Hi again', 2)).rows[0].id).toBeTruthy();
      await expect(out('One too many', 2)).rejects.toMatchObject({ message: 'practice_full' });
      await expect(out('', 10)).rejects.toMatchObject({ code: '22023' });
      await expect(out('x'.repeat(1601), 10)).rejects.toMatchObject({ code: '22023' });
    });

    it('expire_practice removes practice rain days older than a week, with their bubbles', async () => {
      if (!db) return;
      const owner = await db.createUser();
      const customer = await customerFor(owner, 'Old');
      const old = (await make(owner, crypto.randomUUID(), rows(customer, 1, 'skipped'))).rows[0]
        .reschedule_id as string;
      const fresh = (await make(owner, crypto.randomUUID(), rows(customer, 1, 'skipped'))).rows[0]
        .reschedule_id as string;
      await db.pool.query(
        "update rain_day.practice_reschedules set created_at = now() - interval '8 days' where id = $1",
        [old],
      );
      const removed = await db.asService((c) =>
        c.query('select rain_day.expire_practice($1) as n', [owner.id]),
      );
      expect(removed.rows[0].n).toBe(1);
      const left = await db.pool.query(
        'select practice_reschedule_id from rain_day.practice_messages where owner_id = $1',
        [owner.id],
      );
      expect(left.rows.map((r) => r.practice_reschedule_id)).toEqual([fresh]);
    });
  },
);
