export type JobAccess = 'owner' | 'device' | 'none';

export interface AccessJob {
  owner_id: string | null;
  expires_at: string | null;
}

/** Has an anonymous job passed its expiry? Owned jobs never expire. */
export function isExpired(job: AccessJob, now: Date = new Date()): boolean {
  return job.expires_at !== null && new Date(job.expires_at).getTime() < now.getTime();
}

/**
 * Who may write to this job. Pure: callers hand in the signed-in user id (or null) and whether
 * the claim token the device sent matches the stored hash.
 *
 *  - The owner, when the job has one and it is the signed-in user.
 *  - The device that made it, while the job is unowned, unexpired and the token matches.
 *  - Nobody else. A claim token never grants access to a job that already has an owner.
 */
export function decideJobAccess(
  job: AccessJob,
  userId: string | null,
  tokenMatches: boolean,
  now: Date = new Date(),
): JobAccess {
  if (job.owner_id !== null) return userId !== null && userId === job.owner_id ? 'owner' : 'none';
  if (tokenMatches && !isExpired(job, now)) return 'device';
  return 'none';
}
