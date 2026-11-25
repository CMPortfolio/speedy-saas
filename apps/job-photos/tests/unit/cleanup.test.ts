import { describe, expect, it } from 'vitest';

import { cleanupExpiredJobs, type CleanupStore } from '@/features/cleanup/cleanup';

const now = new Date('2026-12-30T08:00:00Z');
const past = '2026-12-01T00:00:00Z';
const future = '2027-01-15T00:00:00Z';

interface FakeJob {
  id: string;
  logo: string | null;
  photos: string[];
  owner?: string | null;
  expiresAt?: string | null;
  retired?: boolean;
  deleted?: boolean;
}

/** An in-memory store that honours owner and expiry the way the SQL does. */
function fakeStore(jobs: FakeJob[], opts: { deleteFails?: string; afterList?: () => void } = {}) {
  const expired = (j: FakeJob) =>
    !j.deleted && (j.owner ?? null) === null && (j.expiresAt ?? past) < now.toISOString();
  const store: CleanupStore = {
    async listExpired(_nowIso, limit) {
      const found = jobs
        .filter(expired)
        .slice(0, limit)
        .map((j) => ({ id: j.id, logoPath: j.logo }));
      opts.afterList?.();
      return found;
    },
    async retire(jobId) {
      const job = jobs.find((j) => j.id === jobId);
      if (!job || !expired(job)) return false;
      job.retired = true;
      return true;
    },
    async photoPaths(jobId) {
      return jobs.find((j) => j.id === jobId)?.photos ?? [];
    },
    async deleteJob(jobId) {
      if (jobId === opts.deleteFails) throw new Error('db down');
      const job = jobs.find((j) => j.id === jobId);
      if (!job || !expired(job)) return false;
      job.deleted = true;
      return true;
    },
  };
  return store;
}

function fakeStorage(failFor?: string) {
  const removed: string[] = [];
  let calls = 0;
  return {
    removed,
    get calls() {
      return calls;
    },
    async remove(paths: readonly string[]) {
      calls += 1;
      if (failFor && paths.some((p) => p.includes(failFor))) throw new Error('storage down');
      removed.push(...paths);
    },
  };
}

describe('cleanupExpiredJobs', () => {
  it('retires, removes photos and logo from storage, then deletes the job', async () => {
    const jobs: FakeJob[] = [
      { id: 'a', logo: 'jobs/a/logo.png', photos: ['jobs/a/before/1.jpg', 'jobs/a/after/1.jpg'] },
      { id: 'b', logo: null, photos: ['jobs/b/before/1.jpg'] },
    ];
    const storage = fakeStorage();
    const result = await cleanupExpiredJobs({
      store: fakeStore(jobs),
      storage,
      now,
      batchSize: 10,
    });
    expect(result).toEqual({ jobsDeleted: 2, filesRemoved: 4, failures: 0 });
    expect(storage.removed.sort()).toEqual([
      'jobs/a/after/1.jpg',
      'jobs/a/before/1.jpg',
      'jobs/a/logo.png',
      'jobs/b/before/1.jpg',
    ]);
    expect(jobs.every((j) => j.retired && j.deleted)).toBe(true);
  });

  it('works through more jobs than one batch', async () => {
    const jobs: FakeJob[] = Array.from({ length: 5 }, (_, i) => ({
      id: `j${i}`,
      logo: null,
      photos: [`p${i}`],
    }));
    const result = await cleanupExpiredJobs({
      store: fakeStore(jobs),
      storage: fakeStorage(),
      now,
      batchSize: 2,
    });
    expect(result.jobsDeleted).toBe(5);
  });

  it('stops at maxJobs', async () => {
    const jobs: FakeJob[] = Array.from({ length: 5 }, (_, i) => ({
      id: `j${i}`,
      logo: null,
      photos: [],
    }));
    const result = await cleanupExpiredJobs({
      store: fakeStore(jobs),
      storage: fakeStorage(),
      now,
      batchSize: 2,
      maxJobs: 3,
    });
    expect(result.jobsDeleted).toBe(3);
    expect(jobs.filter((j) => j.deleted)).toHaveLength(3);
  });

  it('leaves a job alone when it was claimed after listing: storage untouched, no failure', async () => {
    const jobs: FakeJob[] = [{ id: 'a', logo: 'jobs/a/logo.png', photos: ['jobs/a/before/1.jpg'] }];
    const storage = fakeStorage();
    const result = await cleanupExpiredJobs({
      store: fakeStore(jobs, {
        afterList: () => {
          jobs[0]!.owner = 'user-1';
          jobs[0]!.expiresAt = null;
        },
      }),
      storage,
      now,
    });
    expect(result).toEqual({ jobsDeleted: 0, filesRemoved: 0, failures: 0 });
    expect(storage.calls).toBe(0);
    expect(jobs[0]!.deleted).toBeUndefined();
    expect(jobs[0]!.retired).toBeUndefined();
  });

  it('never lists or deletes a job that has not expired yet', async () => {
    const jobs: FakeJob[] = [
      { id: 'fresh', logo: null, photos: ['jobs/fresh/before/1.jpg'], expiresAt: future },
      { id: 'owned', logo: null, photos: ['jobs/owned/before/1.jpg'], owner: 'u', expiresAt: null },
    ];
    const storage = fakeStorage();
    const result = await cleanupExpiredJobs({ store: fakeStore(jobs), storage, now });
    expect(result).toEqual({ jobsDeleted: 0, filesRemoved: 0, failures: 0 });
    expect(storage.calls).toBe(0);
    expect(jobs.some((j) => j.deleted)).toBe(false);
  });

  it('keeps the job when its files could not be removed, and carries on with the rest', async () => {
    const jobs: FakeJob[] = [
      { id: 'a', logo: null, photos: ['jobs/a/before/1.jpg'] },
      { id: 'b', logo: null, photos: ['jobs/b/before/1.jpg'] },
    ];
    const result = await cleanupExpiredJobs({
      store: fakeStore(jobs),
      storage: fakeStorage('jobs/a/'),
      now,
      batchSize: 10,
    });
    expect(result).toEqual({ jobsDeleted: 1, filesRemoved: 1, failures: 1 });
    expect(jobs[0]!.deleted).toBeUndefined();
    // Still retired, so the next run picks it up again and a claim cannot revive it.
    expect(jobs[0]!.retired).toBe(true);
  });

  it('counts a failed delete and does not loop forever on it', async () => {
    const jobs: FakeJob[] = [{ id: 'a', logo: null, photos: [] }];
    const result = await cleanupExpiredJobs({
      store: fakeStore(jobs, { deleteFails: 'a' }),
      storage: fakeStorage(),
      now,
      batchSize: 10,
    });
    expect(result.failures).toBe(1);
    expect(result.jobsDeleted).toBe(0);
  });

  it('does nothing when nothing has expired', async () => {
    const result = await cleanupExpiredJobs({
      store: fakeStore([]),
      storage: fakeStorage(),
      now,
    });
    expect(result).toEqual({ jobsDeleted: 0, filesRemoved: 0, failures: 0 });
  });
});
