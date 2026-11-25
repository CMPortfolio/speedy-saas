import { z } from 'zod';

/**
 * Claiming: after sign-in the phone sends the claim tokens it kept for the jobs it created,
 * and the server attaches those jobs to the account. Pure pieces live here so the rules are
 * unit-tested without a database.
 */
export const MAX_CLAIMS_PER_REQUEST = 200;

export const claimRequestSchema = z.object({
  claims: z
    .array(z.object({ id: z.uuid(), token: z.string().min(1).max(200) }))
    .max(MAX_CLAIMS_PER_REQUEST),
  /** Business details kept on the device, moved to the profile on first sign-in. */
  business: z
    .object({
      name: z.string().trim().max(120).nullable().optional(),
      logoDataUrl: z
        .string()
        .max(400_000)
        .regex(/^data:image\/(png|jpeg|webp);base64,/)
        .nullable()
        .optional(),
    })
    .optional(),
});
export type ClaimRequest = z.infer<typeof claimRequestSchema>;

export interface ClaimableJob {
  owner_id: string | null;
  claim_token_hash: string | null;
}

/**
 * May this job be attached to the signed-in user? Only a job with no owner yet, and only when
 * the device's token matches the stored hash. Expiry does not matter: the owner is signing in
 * to keep the job, so a job past its anonymous expiry (but not yet cleaned up) is theirs too.
 */
export function canClaim(job: ClaimableJob | null | undefined, tokenMatches: boolean): boolean {
  return Boolean(job && job.owner_id === null && job.claim_token_hash !== null && tokenMatches);
}

export interface DecodedDataUrl {
  contentType: string;
  bytes: Uint8Array;
}

/** Decode a base64 data URL into bytes, or null when it is not one. */
export function decodeDataUrl(dataUrl: string): DecodedDataUrl | null {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  const [, contentType, base64] = match ?? [];
  if (!contentType || !base64) return null;
  try {
    return {
      contentType: contentType.toLowerCase(),
      bytes: Uint8Array.from(Buffer.from(base64, 'base64')),
    };
  } catch {
    return null;
  }
}

/** Does the profile still need business details? Only fill empty fields, never overwrite. */
export function profilePatchFromDevice(
  profile: { business_name: string | null; logo_path: string | null } | null,
  business: ClaimRequest['business'],
  uploadedLogoPath: string | null,
): { business_name?: string; logo_path?: string } {
  const patch: { business_name?: string; logo_path?: string } = {};
  const name = business?.name?.trim();
  if (name && !profile?.business_name) patch.business_name = name;
  if (uploadedLogoPath && !profile?.logo_path) patch.logo_path = uploadedLogoPath;
  return patch;
}
