import { isExpired, type AccessJob } from './access';

export type ShareState = 'ok' | 'not_found' | 'expired';

/**
 * What the public share page should do for a slug lookup. Pure, so the 404/410 decisions are
 * unit-tested without a database: no row is not found; an anonymous job past its expiry is
 * expired; everything else renders.
 */
export function shareState(job: AccessJob | null | undefined, now: Date = new Date()): ShareState {
  if (!job) return 'not_found';
  if (isExpired(job, now)) return 'expired';
  return 'ok';
}
