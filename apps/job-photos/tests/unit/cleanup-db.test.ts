import { connectTestDb, type TestDb } from '@speedy/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanupExpiredJobs, supabaseCleanupStore } from '@/features/cleanup/cleanup';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@speedy/db/types';
import { memoryStorage } from '@speedy/lib/photos';

/** Real tables, fake storage: expired anonymous jobs go, owned and fresh ones stay. */
let db: TestDb | null = null;
const slug = () => Math.random().toString(36).slice(2).padEnd(20, 'x').slice(0, 20);
const HASH = 'b'.repeat(64);

async function insertJob(owner: string | null, expires: string | null): Promise<string> {
  if (!db) throw new Error('no db');
  const { rows } = await db.asService((c) =>
    c.query<{ id: string }>(
      `insert into job_photos.jobs (owner_id, share_slug, claim_token_hash, expires_at, logo_path)
       values ($1, $2, $3, $4::timestamptz, $5) returning id`,
      [owner, slug(), HASH, expires, owner === null ? `jobs/logo-${slug()}.png` : null],
    ),
  );
  return rows[0]!.id;
}

async function insertPhoto(jobId: string, path: string) {
  await db!.asService((c) =>
    c.query(
      `insert into job_photos.photos (job_id, kind, storage_path, width, height, position)
       values ($1, 'before', $2, 10, 10, 0)`,
      [jobId, path],
    ),
  );
}

const exists = async (id: string) =>
  (await db!.asService((c) => c.query('select 1 from job_photos.jobs where id = $1', [id])))
    .rowCount === 1;

beforeAll(async () => {
  db = await connectTestDb();
});
afterAll(async () => {
  await db?.close();
});

describe.skipIf(!process.env.CI && !process.env.DATABASE_URL && !process.env.DB_TESTS)(
  'cleanup against the database',
  () => {
    it('deletes only expired anonymous jobs, their photo rows and their files', async () => {
      const owner = await db!.createUser();
      const expired = await insertJob(null, new Date(Date.now() - 86_400_000).toISOString());
      const fresh = await insertJob(null, new Date(Date.now() + 86_400_000).toISOString());
      const owned = await insertJob(owner.id, null);
      const files = memoryStorage();
      for (const [id, path] of [
        [expired, `jobs/${expired}/before/1.jpg`],
        [fresh, `jobs/${fresh}/before/1.jpg`],
        [owned, `jobs/${owned}/before/1.jpg`],
      ] as const) {
        await insertPhoto(id, path);
        await files.put(path, new Uint8Array([1]), 'image/jpeg');
      }

      const client = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      const result = await cleanupExpiredJobs({
        store: supabaseCleanupStore(client),
        storage: files,
      });

      expect(result.failures).toBe(0);
      expect(result.jobsDeleted).toBeGreaterThanOrEqual(1);
      expect(await exists(expired)).toBe(false);
      expect(await exists(fresh)).toBe(true);
      expect(await exists(owned)).toBe(true);
      await expect(files.createSignedUrl(`jobs/${expired}/before/1.jpg`, 60)).rejects.toThrow();
      await expect(files.createSignedUrl(`jobs/${fresh}/before/1.jpg`, 60)).resolves.toBeTypeOf(
        'string',
      );
      await expect(files.createSignedUrl(`jobs/${owned}/before/1.jpg`, 60)).resolves.toBeTypeOf(
        'string',
      );
    });
  },
);
