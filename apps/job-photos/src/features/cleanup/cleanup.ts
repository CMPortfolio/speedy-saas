import type { Database } from '@speedy/db/types';
import type { StorageAdapter } from '@speedy/lib/photos';
import type { SupabaseClient } from '@supabase/supabase-js';

import { RETIRED_CLAIM_HASH } from '../jobs/claims';

/**
 * Deletes anonymous jobs past their expiry, and their photos and logo from storage. No
 * `server-only` here on purpose: the Railway cron script runs this outside Next.
 */
export interface ExpiredJob {
  id: string;
  logoPath: string | null;
}

export interface CleanupStore {
  /** Anonymous jobs (no owner) whose expires_at is before `nowIso`. */
  listExpired(nowIso: string, limit: number): Promise<ExpiredJob[]>;
  /**
   * Take the job over before touching its files: one conditional UPDATE that marks it retired
   * if it is still anonymous and expired. False means it was claimed (or changed) since it was
   * listed, and the caller must leave it and its files alone. Retiring twice is fine.
   */
  retire(jobId: string, nowIso: string): Promise<boolean>;
  photoPaths(jobId: string): Promise<string[]>;
  /** Delete the job (photo rows cascade) only if it is still anonymous and expired. */
  deleteJob(jobId: string, nowIso: string): Promise<boolean>;
}

export interface CleanupResult {
  jobsDeleted: number;
  filesRemoved: number;
  failures: number;
}

export interface CleanupOptions {
  store: CleanupStore;
  storage: Pick<StorageAdapter, 'remove'>;
  now?: Date;
  batchSize?: number;
  /** Most jobs to handle in one run (default 500); the rest wait for the next run. */
  maxJobs?: number;
  onError?: (jobId: string, error: unknown) => void;
}

const DEFAULT_BATCH = 50;
const DEFAULT_MAX_JOBS = 500;

/**
 * Per job: retire it (so a sign-in claim can no longer win), remove its files, delete the row.
 * If retire finds the job claimed, nothing is touched. If removing files fails the job stays
 * retired and the next run tries again; if the row delete fails the files are already gone and
 * removing them again is a no-op. A job that fails is skipped for the rest of this run so one
 * bad job cannot stall the others.
 */
export async function cleanupExpiredJobs(options: CleanupOptions): Promise<CleanupResult> {
  const { store, storage, onError } = options;
  const nowIso = (options.now ?? new Date()).toISOString();
  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  const result: CleanupResult = { jobsDeleted: 0, filesRemoved: 0, failures: 0 };
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS;
  const failed = new Set<string>();
  let handled = 0;

  /** One job. Returns the number of files removed, or null when it was not deleted. */
  const cleanOne = async (job: ExpiredJob): Promise<number | null> => {
    if (!(await store.retire(job.id, nowIso))) return null;
    const paths = [...(await store.photoPaths(job.id))];
    if (job.logoPath) paths.push(job.logoPath);
    await storage.remove(paths);
    return (await store.deleteJob(job.id, nowIso)) ? paths.length : null;
  };

  for (;;) {
    // Failed jobs come back in the next listing, so over-fetch by what we already skipped.
    const batch = (await store.listExpired(nowIso, batchSize + failed.size)).filter(
      (job) => !failed.has(job.id),
    );
    if (batch.length === 0) return result;

    for (const job of batch.slice(0, batchSize)) {
      if (handled >= maxJobs) return result;
      handled += 1;
      const removed = await cleanOne(job).catch((error: unknown) => {
        result.failures += 1;
        onError?.(job.id, error);
        return null;
      });
      if (removed === null) {
        // Failed, or claimed since we listed it: skip it for the rest of this run.
        failed.add(job.id);
      } else {
        result.jobsDeleted += 1;
        result.filesRemoved += removed;
      }
    }
  }
}

/** The store backed by the job_photos schema. Needs a service-role client. */
export function supabaseCleanupStore(client: SupabaseClient<Database>): CleanupStore {
  const db = () => client.schema('job_photos');
  return {
    async listExpired(nowIso, limit) {
      const { data, error } = await db()
        .from('jobs')
        .select('id, logo_path')
        .is('owner_id', null)
        .not('expires_at', 'is', null)
        .lt('expires_at', nowIso)
        .order('expires_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return data.map((row) => ({ id: row.id, logoPath: row.logo_path }));
    },
    async retire(jobId, nowIso) {
      const { data, error } = await db()
        .from('jobs')
        .update({ claim_token_hash: RETIRED_CLAIM_HASH })
        .eq('id', jobId)
        .is('owner_id', null)
        .not('expires_at', 'is', null)
        .lt('expires_at', nowIso)
        .select('id');
      if (error) throw error;
      return data.length > 0;
    },
    async photoPaths(jobId) {
      const { data, error } = await db().from('photos').select('storage_path').eq('job_id', jobId);
      if (error) throw error;
      return data.map((row) => row.storage_path);
    },
    async deleteJob(jobId, nowIso) {
      const { data, error } = await db()
        .from('jobs')
        .delete()
        .eq('id', jobId)
        .is('owner_id', null)
        .not('expires_at', 'is', null)
        .lt('expires_at', nowIso)
        .select('id');
      if (error) throw error;
      return data.length > 0;
    },
  };
}
