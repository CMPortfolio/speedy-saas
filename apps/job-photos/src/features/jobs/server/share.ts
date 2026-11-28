import 'server-only';

import { SIGNED_URL_TTL_SECONDS, type PhotoKind } from '@/config/constants';
import { SHARE_SLUG_PATTERN } from '@/lib/share-url';
import { getStorage } from '@/lib/storage';

import { shareState } from '../share-state';

import { getJobBySlug, listPhotos } from './repo';

export interface SharePhoto {
  id: string;
  kind: PhotoKind;
  url: string;
  width: number;
  height: number;
  position: number;
}

export interface ShareJob {
  id: string;
  title: string | null;
  note: string | null;
  businessName: string | null;
  logoUrl: string | null;
  reviewUrl: string | null;
  createdAt: string;
  before: SharePhoto[];
  after: SharePhoto[];
}

export type ShareResult =
  { state: 'ok'; job: ShareJob } | { state: 'not_found' } | { state: 'expired' };

/**
 * Everything the public share page needs, looked up by share_slug with the service client and
 * nothing else. Photos come back as short-lived signed URLs. An unknown or malformed slug is
 * not_found; an anonymous job past its expiry is expired.
 */
export async function loadShareJob(slug: string): Promise<ShareResult> {
  if (!SHARE_SLUG_PATTERN.test(slug)) return { state: 'not_found' };
  const job = await getJobBySlug(slug);
  const state = shareState(job);
  if (state !== 'ok' || !job) return { state: state === 'ok' ? 'not_found' : state };

  const storage = getStorage();
  const sign = (path: string) => storage.createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  const rows = await listPhotos(job.id);
  const [logoUrl, ...photos] = await Promise.all([
    job.logo_path ? sign(job.logo_path).catch(() => null) : Promise.resolve(null),
    ...rows.map(async (row): Promise<SharePhoto> => ({
      id: row.id,
      kind: row.kind,
      url: await sign(row.storage_path),
      width: row.width,
      height: row.height,
      position: row.position,
    })),
  ]);

  return {
    state: 'ok',
    job: {
      id: job.id,
      title: job.title,
      note: job.note,
      businessName: job.business_name,
      logoUrl,
      reviewUrl: job.review_url,
      createdAt: job.created_at,
      before: photos.filter((p) => p.kind === 'before'),
      after: photos.filter((p) => p.kind === 'after'),
    },
  };
}
