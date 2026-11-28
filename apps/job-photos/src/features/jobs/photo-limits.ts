import { appError, err, ok, type Result } from '@speedy/lib/result';

import { MAX_PHOTOS_PER_KIND, MAX_UPLOAD_BYTES } from '@/config/constants';

export interface UploadCandidate {
  type: string;
  size: number;
}

export interface UploadLimits {
  maxBytes?: number;
  maxPerKind?: number;
}

/** How many more photos of a kind a job can take. Never negative. */
export function remainingSlots(existing: number, maxPerKind = MAX_PHOTOS_PER_KIND): number {
  return Math.max(0, maxPerKind - Math.max(0, existing));
}

/**
 * Is this file acceptable as the next photo of its kind? Pure, so the browser can check before
 * uploading and the server can check again on arrival.
 */
export function validateUpload(
  file: UploadCandidate,
  existingOfKind: number,
  limits: UploadLimits = {},
): Result<true> {
  const maxBytes = limits.maxBytes ?? MAX_UPLOAD_BYTES;
  const maxPerKind = limits.maxPerKind ?? MAX_PHOTOS_PER_KIND;
  if (!/^image\//i.test(file.type)) {
    return err(appError('not_an_image', 'That file is not a photo.'));
  }
  if (file.size <= 0) {
    return err(appError('empty_file', 'That photo is empty.'));
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return err(appError('too_large', `Photos must be under ${mb}MB.`));
  }
  if (remainingSlots(existingOfKind, maxPerKind) === 0) {
    return err(appError('too_many', `Up to ${maxPerKind} photos each for before and after.`));
  }
  return ok(true);
}
