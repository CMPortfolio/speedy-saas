import 'server-only';

import type { ServerSupabase } from '@speedy/auth/server';
import { getProfile, updateProfile } from '@speedy/db/core';
import { verifyClaimToken } from '@speedy/lib/device-claims';
import { buildObjectPath, extensionFor } from '@speedy/lib/photos';

import { getStorage } from '@/lib/storage';

import { canClaim, decodeDataUrl, profilePatchFromDevice, type ClaimRequest } from '../claims';

import { claimJob, getJob } from './repo';

/**
 * Attach the jobs this device made to the signed-in user: only those whose claim token hashes
 * to what we stored. Each token is checked with a constant-time compare. Returns the ids that
 * were claimed; unknown ids, wrong tokens and already-owned jobs are silently skipped.
 */
export async function claimJobs(userId: string, claims: ClaimRequest['claims']): Promise<string[]> {
  const claimed: string[] = [];
  for (const { id, token } of claims) {
    const job = await getJob(id);
    const matches = job ? await verifyClaimToken(token, job.claim_token_hash) : false;
    if (!canClaim(job, matches)) continue;
    if (await claimJob(id, userId)) claimed.push(id);
  }
  return claimed;
}

const MAX_LOGO_BYTES = 300 * 1024;

/** Store the phone's logo under logos/<user>/<file>; null when it is not a usable image. */
async function uploadDeviceLogo(userId: string, dataUrl: string): Promise<string | null> {
  const decoded = decodeDataUrl(dataUrl);
  const extension = decoded ? extensionFor(decoded.contentType) : undefined;
  if (!decoded || !extension || decoded.bytes.byteLength > MAX_LOGO_BYTES) return null;
  const path = buildObjectPath(['logos', userId, crypto.randomUUID()], extension);
  await getStorage().put(path, decoded.bytes, decoded.contentType);
  return path;
}

/**
 * First sign-in: move the business name and logo the phone remembered onto the profile, filling
 * only what is still empty. Runs with the user's own client so profile RLS applies.
 */
export async function moveBusinessToProfile(
  db: ServerSupabase,
  userId: string,
  business: ClaimRequest['business'],
): Promise<void> {
  if (!business?.name && !business?.logoDataUrl) return;
  const profile = await getProfile(db, userId);
  const logoPath =
    business.logoDataUrl && !profile?.logo_path
      ? await uploadDeviceLogo(userId, business.logoDataUrl)
      : null;
  const patch = profilePatchFromDevice(profile, business, logoPath);
  if (Object.keys(patch).length > 0) await updateProfile(db, userId, patch);
}
