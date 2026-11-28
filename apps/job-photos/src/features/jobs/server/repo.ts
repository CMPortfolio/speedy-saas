import 'server-only';

import { createServiceSupabase } from '@speedy/auth/server';
import type { Database } from '@speedy/db/types';
import { hashClaimToken } from '@speedy/lib/device-claims';
import { randomSlug, randomToken } from '@speedy/lib/ids';

import { ANONYMOUS_JOB_TTL_DAYS, type PhotoKind } from '@/config/constants';

import type { CreateJobInput, CreatedJob, UpdateJobInput } from '../schemas';

export type JobRow = Database['job_photos']['Tables']['jobs']['Row'];
export type PhotoRow = Database['job_photos']['Tables']['photos']['Row'];

/**
 * Data access for this tool's tables, always through the service client. Every caller must
 * authorise first (see ./authorize.ts): the service role bypasses RLS on purpose so jobs made
 * without sign-in can be written at all.
 */
function jobsDb() {
  return createServiceSupabase().schema('job_photos');
}

export function anonymousExpiry(now = new Date()): string {
  return new Date(now.getTime() + ANONYMOUS_JOB_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Create a job. Without an owner it expires after ANONYMOUS_JOB_TTL_DAYS and can be claimed
 * later with the token we return (only its hash is stored).
 */
export async function createJob(
  input: CreateJobInput & { logo_path?: string | null },
  ownerId: string | null,
): Promise<Omit<CreatedJob, 'shareUrl'>> {
  const claimToken = randomToken();
  const shareSlug = randomSlug();
  const { data, error } = await jobsDb()
    .from('jobs')
    .insert({
      owner_id: ownerId,
      share_slug: shareSlug,
      title: input.title ?? null,
      note: input.note ?? null,
      business_name: input.business_name ?? null,
      review_url: input.review_url ?? null,
      logo_path: input.logo_path ?? null,
      claim_token_hash: await hashClaimToken(claimToken),
      expires_at: ownerId ? null : anonymousExpiry(),
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, shareSlug, claimToken };
}

export async function getJob(id: string): Promise<JobRow | null> {
  const { data, error } = await jobsDb().from('jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** The share page's lookup. Callers decide what an expired or missing job means. */
export async function getJobBySlug(shareSlug: string): Promise<JobRow | null> {
  const { data, error } = await jobsDb()
    .from('jobs')
    .select('*')
    .eq('share_slug', shareSlug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateJob(id: string, patch: UpdateJobInput): Promise<JobRow> {
  const fields: Database['job_photos']['Tables']['jobs']['Update'] = {};
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.note !== undefined) fields.note = patch.note;
  if (patch.business_name !== undefined) fields.business_name = patch.business_name;
  if (patch.review_url !== undefined) fields.review_url = patch.review_url;
  const { data, error } = await jobsDb()
    .from('jobs')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Attach an unowned job to a user and drop what made it anonymous. The `is('owner_id', null)`
 * guard means two devices racing with the same token cannot both win.
 */
export async function claimJob(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await jobsDb()
    .from('jobs')
    .update({ owner_id: ownerId, expires_at: null, claim_token_hash: null })
    .eq('id', id)
    .is('owner_id', null)
    .select('id');
  if (error) throw error;
  return data.length > 0;
}

export async function setJobLogo(id: string, logoPath: string): Promise<void> {
  const { error } = await jobsDb().from('jobs').update({ logo_path: logoPath }).eq('id', id);
  if (error) throw error;
}

export async function listPhotos(jobId: string): Promise<PhotoRow[]> {
  const { data, error } = await jobsDb()
    .from('photos')
    .select('*')
    .eq('job_id', jobId)
    .order('kind')
    .order('position');
  if (error) throw error;
  return data;
}

export async function countPhotos(jobId: string, kind: PhotoKind): Promise<number> {
  const { count, error } = await jobsDb()
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('kind', kind);
  if (error) throw error;
  return count ?? 0;
}

export interface NewPhoto {
  id: string;
  jobId: string;
  kind: PhotoKind;
  storagePath: string;
  width: number;
  height: number;
  position: number;
}

export async function insertPhoto(photo: NewPhoto): Promise<PhotoRow> {
  const { data, error } = await jobsDb()
    .from('photos')
    .insert({
      id: photo.id,
      job_id: photo.jobId,
      kind: photo.kind,
      storage_path: photo.storagePath,
      width: photo.width,
      height: photo.height,
      position: photo.position,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
