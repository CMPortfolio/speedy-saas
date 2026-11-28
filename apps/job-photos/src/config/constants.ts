/** Facts the whole tool agrees on. Change them here, nowhere else. */

/** Jobs made without signing in are kept this long, then the link stops working. */
export const ANONYMOUS_JOB_TTL_DAYS = 30;

/** Before and after each take up to this many photos. */
export const MAX_PHOTOS_PER_KIND = 6;

/** Largest upload the server accepts, after the browser has resized the photo. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** The browser scales photos so the long edge is this many pixels before uploading. */
export const PHOTO_MAX_EDGE = 2000;

/** JPEG quality for the resized photo. */
export const PHOTO_JPEG_QUALITY = 0.82;

/** Logos are small: long edge in pixels. */
export const LOGO_MAX_EDGE = 320;

/** The private Supabase Storage bucket for this tool. Created by the tables migration. */
export const STORAGE_BUCKET = 'job-photos';

/** Namespace for device claims in localStorage (`@speedy/lib/device-claims`). */
export const CLAIM_NAMESPACE = 'job-photos';

/** Header the device sends with the claim token it got when it created the job. */
export const CLAIM_TOKEN_HEADER = 'x-claim-token';

/** Signed URLs for photos on the share page live this long. */
export const SIGNED_URL_TTL_SECONDS = 10 * 60;

export const PHOTO_KINDS = ['before', 'after'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];
