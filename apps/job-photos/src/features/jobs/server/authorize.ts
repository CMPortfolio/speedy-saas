import 'server-only';

import { getOptionalUser } from '@speedy/auth/user';
import { verifyClaimToken } from '@speedy/lib/device-claims';

import { CLAIM_TOKEN_HEADER } from '@/config/constants';

import { decideJobAccess, type JobAccess } from '../access';

import { getJob, type JobRow } from './repo';

export interface AuthorizedJob {
  job: JobRow;
  access: Exclude<JobAccess, 'none'>;
  userId: string | null;
}

/**
 * Load the job and decide whether this request may write to it: the signed-in owner, or the
 * device holding the claim token. Returns null for an unknown job or no access (the route
 * answers 404 either way, so a token holder learns nothing about other jobs).
 */
export async function authorizeJob(jobId: string, request: Request): Promise<AuthorizedJob | null> {
  const job = await getJob(jobId);
  if (!job) return null;
  const user = await getOptionalUser();
  const token = request.headers.get(CLAIM_TOKEN_HEADER);
  const tokenMatches = token ? await verifyClaimToken(token, job.claim_token_hash) : false;
  const access = decideJobAccess(job, user?.id ?? null, tokenMatches);
  if (access === 'none') return null;
  return { job, access, userId: user?.id ?? null };
}
