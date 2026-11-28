import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectTestDb, isDenied, type TestDb, type TestUser } from './harness';

let db: TestDb | null = null;
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  alice = await db.createUser();
  bob = await db.createUser();
});

afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'core schema RLS',
  () => {
    it('creates a profile for every new auth user', async () => {
      if (!db) return;
      const rows = await db.asService((c) =>
        c.query('select id from public.profiles where id = any($1::uuid[])', [[alice.id, bob.id]]),
      );
      expect(rows.rowCount).toBe(2);
    });

    it('a user reads only their own profile', async () => {
      if (!db) return;
      const mine = await db.as(alice, (c) => c.query('select id from public.profiles'));
      expect(mine.rows).toEqual([{ id: alice.id }]);
      const theirs = await db.as(alice, (c) =>
        c.query('select id from public.profiles where id = $1', [bob.id]),
      );
      expect(theirs.rowCount).toBe(0);
    });

    it('a user cannot update another user profile', async () => {
      if (!db) return;
      const res = await db.as(alice, (c) =>
        c.query("update public.profiles set business_name = 'hacked' where id = $1", [bob.id]),
      );
      expect(res.rowCount).toBe(0);
      const own = await db.as(alice, (c) =>
        c.query(
          "update public.profiles set business_name = 'Green Gulf Lawn' where id = $1 returning business_name",
          [alice.id],
        ),
      );
      expect(own.rows[0]).toEqual({ business_name: 'Green Gulf Lawn' });
    });

    it('tool_usage is private and record_tool_usage bumps the count', async () => {
      if (!db) return;
      await db.asCommitted(alice, async (c) => {
        await c.query("select public.record_tool_usage('job-photos')");
        await c.query("select public.record_tool_usage('job-photos')");
      });
      const mine = await db.as(alice, (c) =>
        c.query('select tool_slug, uses from public.tool_usage'),
      );
      expect(mine.rows).toEqual([{ tool_slug: 'job-photos', uses: 2 }]);
      const bobs = await db.as(bob, (c) => c.query('select * from public.tool_usage'));
      expect(bobs.rowCount).toBe(0);
      await expect(
        db.as(bob, (c) =>
          c.query("insert into public.tool_usage (user_id, tool_slug) values ($1, 'x')", [
            alice.id,
          ]),
        ),
      ).rejects.toSatisfy(isDenied);
    });

    it('memberships: members see their org, outsiders see nothing', async () => {
      if (!db) return;
      const orgId = await db.asCommitted(alice, async (c) => {
        const org = await c.query<{ id: string }>(
          "insert into public.organizations (name, created_by) values ('Crew', $1) returning id",
          [alice.id],
        );
        const id = org.rows[0]!.id;
        await c.query(
          "insert into public.memberships (organization_id, user_id, role) values ($1, $2, 'owner')",
          [id, alice.id],
        );
        return id;
      });
      const seen = await db.as(alice, (c) => c.query('select id from public.organizations'));
      expect(seen.rows).toEqual([{ id: orgId }]);
      const bobSees = await db.as(bob, (c) => c.query('select id from public.organizations'));
      expect(bobSees.rowCount).toBe(0);
      const bobMemberships = await db.as(bob, (c) => c.query('select id from public.memberships'));
      expect(bobMemberships.rowCount).toBe(0);
      // Bob cannot add himself.
      await expect(
        db.as(bob, (c) =>
          c.query('insert into public.memberships (organization_id, user_id) values ($1, $2)', [
            orgId,
            bob.id,
          ]),
        ),
      ).rejects.toSatisfy(isDenied);
    });

    it('feedback: anonymous insert allowed, reads are private', async () => {
      if (!db) return;
      await db.asCommitted(null, (c) =>
        c.query("insert into public.feedback (tool_slug, helped) values ('job-photos', true)"),
      );
      await expect(
        db.as(null, (c) =>
          c.query(
            "insert into public.feedback (tool_slug, helped, user_id) values ('x', true, $1)",
            [alice.id],
          ),
        ),
      ).rejects.toSatisfy(isDenied);
      await db.asCommitted(alice, (c) =>
        c.query(
          "insert into public.feedback (tool_slug, helped, user_id) values ('job-photos', false, $1)",
          [alice.id],
        ),
      );
      const mine = await db.as(alice, (c) => c.query('select helped from public.feedback'));
      expect(mine.rows).toEqual([{ helped: false }]);
      const anon = await db.as(null, (c) => c.query('select * from public.feedback'));
      expect(anon.rowCount).toBe(0);
    });

    it('anon cannot read profiles or tool_usage', async () => {
      if (!db) return;
      expect((await db.as(null, (c) => c.query('select * from public.profiles'))).rowCount).toBe(0);
      expect((await db.as(null, (c) => c.query('select * from public.tool_usage'))).rowCount).toBe(
        0,
      );
    });
  },
);
