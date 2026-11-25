import { connectTestDb, isDenied, type TestDb, type TestUser } from '@speedy/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * RLS for schema job_photos. Rows are created with the service role (as the app's server routes
 * do) and then read as users. Needs a database: DB_TESTS=1 or DATABASE_URL (see packages/db).
 */
let db: TestDb | null = null;
let alice: TestUser;
let bob: TestUser;
let aliceJob: string;
let bobJob: string;
let anonJob: string;

const SLUG = () => Math.random().toString(36).slice(2).padEnd(20, 'x').slice(0, 20);
const HASH = 'a'.repeat(64);

async function insertJob(owner: string | null): Promise<string> {
  if (!db) throw new Error('no db');
  const { rows } = await db.asService((c) =>
    c.query<{ id: string }>(
      `insert into job_photos.jobs (owner_id, share_slug, title, claim_token_hash, expires_at)
       values ($1, $2, 'Job', $3, case when $1::uuid is null then now() + interval '30 days' end)
       returning id`,
      [owner, SLUG(), HASH],
    ),
  );
  return rows[0]!.id;
}

async function insertPhoto(jobId: string, kind: 'before' | 'after', position: number) {
  if (!db) throw new Error('no db');
  await db.asService((c) =>
    c.query(
      `insert into job_photos.photos (job_id, kind, storage_path, width, height, position)
       values ($1, $2, $3, 2000, 1500, $4)`,
      [jobId, kind, `jobs/${jobId}/${kind}/${crypto.randomUUID()}.jpg`, position],
    ),
  );
}

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  alice = await db.createUser();
  bob = await db.createUser();
  aliceJob = await insertJob(alice.id);
  bobJob = await insertJob(bob.id);
  anonJob = await insertJob(null);
  await insertPhoto(aliceJob, 'before', 0);
  await insertPhoto(bobJob, 'before', 0);
  await insertPhoto(anonJob, 'after', 0);
});

afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'job_photos RLS',
  () => {
    it('an owner reads only their own jobs and photos', async () => {
      if (!db) return;
      const jobs = await db.as(alice, (c) => c.query('select id from job_photos.jobs'));
      expect(jobs.rows).toEqual([{ id: aliceJob }]);
      const photos = await db.as(alice, (c) => c.query('select job_id from job_photos.photos'));
      expect(photos.rows).toEqual([{ job_id: aliceJob }]);
      const bobs = await db.as(alice, (c) =>
        c.query('select id from job_photos.jobs where id = $1', [bobJob]),
      );
      expect(bobs.rowCount).toBe(0);
    });

    it('anon reads nothing, not even by slug', async () => {
      if (!db) return;
      expect((await db.as(null, (c) => c.query('select * from job_photos.jobs'))).rowCount).toBe(0);
      expect((await db.as(null, (c) => c.query('select * from job_photos.photos'))).rowCount).toBe(
        0,
      );
      await expect(
        db.as(null, (c) =>
          c.query(
            "insert into job_photos.jobs (share_slug, claim_token_hash) values ('abcdefghijklmnopqrst', $1)",
            [HASH],
          ),
        ),
      ).rejects.toSatisfy(isDenied);
    });

    it('an owner cannot touch another owner job or its photos', async () => {
      if (!db) return;
      const upd = await db.as(alice, (c) =>
        c.query("update job_photos.jobs set title = 'hacked' where id = $1", [bobJob]),
      );
      expect(upd.rowCount).toBe(0);
      const del = await db.as(alice, (c) =>
        c.query('delete from job_photos.photos where job_id = $1', [bobJob]),
      );
      expect(del.rowCount).toBe(0);
      await expect(
        db.as(alice, (c) =>
          c.query(
            `insert into job_photos.photos (job_id, kind, storage_path, width, height, position)
             values ($1, 'after', 'jobs/x/after/y.jpg', 10, 10, 5)`,
            [bobJob],
          ),
        ),
      ).rejects.toSatisfy(isDenied);
    });

    it('an authenticated user cannot claim an anonymous job directly', async () => {
      if (!db) return;
      const claim = await db.as(alice, (c) =>
        c.query('update job_photos.jobs set owner_id = $1 where owner_id is null', [alice.id]),
      );
      expect(claim.rowCount).toBe(0);
      const still = await db.asService((c) =>
        c.query('select owner_id from job_photos.jobs where id = $1', [anonJob]),
      );
      expect(still.rows[0]).toEqual({ owner_id: null });
    });

    it('an owner can insert and update their own rows', async () => {
      if (!db) return;
      await db.as(alice, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `insert into job_photos.jobs (owner_id, share_slug, title) values ($1, $2, 'Mine') returning id`,
          [alice.id, SLUG()],
        );
        await c.query(
          `insert into job_photos.photos (job_id, kind, storage_path, width, height)
           values ($1, 'before', $2, 100, 100)`,
          [rows[0]!.id, `jobs/${rows[0]!.id}/before/p.jpg`],
        );
        const upd = await c.query("update job_photos.jobs set note = 'done' where id = $1", [
          rows[0]!.id,
        ]);
        expect(upd.rowCount).toBe(1);
      });
    });

    it('claiming is a service-role operation and only the new owner sees the job after', async () => {
      if (!db) return;
      const job = await insertJob(null);
      const claimed = await db.asService((c) =>
        c.query(
          `update job_photos.jobs set owner_id = $1, expires_at = null, claim_token_hash = null
           where id = $2 and owner_id is null returning id`,
          [alice.id, job],
        ),
      );
      expect(claimed.rowCount).toBe(1);
      const again = await db.asService((c) =>
        c.query(
          `update job_photos.jobs set owner_id = $1 where id = $2 and owner_id is null returning id`,
          [bob.id, job],
        ),
      );
      expect(again.rowCount).toBe(0);
      const alices = await db.as(alice, (c) =>
        c.query('select id, expires_at from job_photos.jobs where id = $1', [job]),
      );
      expect(alices.rows).toEqual([{ id: job, expires_at: null }]);
      const bobs = await db.as(bob, (c) =>
        c.query('select id from job_photos.jobs where id = $1', [job]),
      );
      expect(bobs.rowCount).toBe(0);
    });

    it('a user cannot give away their job by setting owner_id to someone else', async () => {
      if (!db) return;
      await expect(
        db.as(alice, (c) =>
          c.query('update job_photos.jobs set owner_id = $1 where id = $2', [bob.id, aliceJob]),
        ),
      ).rejects.toSatisfy(isDenied);
    });
  },
);
