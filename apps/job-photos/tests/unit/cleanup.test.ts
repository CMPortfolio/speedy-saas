import { describe, expect, it } from 'vitest';

import { cleanupExpiredJobs, type CleanupStore } from '@/features/cleanup/cleanup';

const now = new Date('2026-12-30T08:00:00Z');

interface FakeJob {
  id: string;
  logo: string | null;
  photos: string[];
  deleted?: boolean;
}

function fakeStore(jobs: FakeJob[], opts: { deleteFails?: string } = {}) {
  const store: CleanupStore = {
    async listExpired(_nowIso, limit) {
      return jobs
        .filter((j) => !j.deleted)
        .slice(0, limit)
        .map((j) => ({ id: j.id, logoPath: j.logo }));
    },
    async photoPaths(jobId) {
      return jobs.find((j) => j.id === jobId)?.photos ?? [];
    },
    async deleteJob(jobId) {
      if (jobId === opts.deleteFails) throw new Error('db down');
      const job = jobs.find((j) => j.id === jobId);
      if (job) job.deleted = true;
      return true;
    },
  };
  return store;
}

function fakeStorage(failFor?: string) {
  const removed: string[] = [];
  return {
    removed,
    async remove(paths: readonly string[]) {
      if (failFor && paths.some((p) => p.includes(failFor))) throw new Error('storage down');
      removed.push(...paths);
    },
  };
}

describe('cleanupExpiredJobs', () => {
  it('removes photos and logo from storage, then deletes the job', async () => {
    const jobs = [
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
    expect(jobs.every((j) => 'deleted' in j)).toBe(true);
  });

  it('works through more jobs than one batch', async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => ({
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

  it('keeps the job when its photos could not be removed, and carries on with the rest', async () => {
    const jobs = [
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
    expect(jobs.find((j) => j.id === 'a')).not.toHaveProperty('deleted');
  });

  it('counts a failed delete and does not loop forever on it', async () => {
    const jobs = [{ id: 'a', logo: null, photos: [] }];
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
