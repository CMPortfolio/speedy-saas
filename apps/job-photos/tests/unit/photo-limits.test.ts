import { describe, expect, it } from 'vitest';

import { MAX_PHOTOS_PER_KIND, MAX_UPLOAD_BYTES } from '@/config/constants';
import { remainingSlots, validateUpload } from '@/features/jobs/photo-limits';

describe('remainingSlots', () => {
  it('counts down to zero and never below', () => {
    expect(remainingSlots(0)).toBe(MAX_PHOTOS_PER_KIND);
    expect(remainingSlots(5)).toBe(1);
    expect(remainingSlots(6)).toBe(0);
    expect(remainingSlots(9)).toBe(0);
    expect(remainingSlots(-3)).toBe(MAX_PHOTOS_PER_KIND);
  });
});

describe('validateUpload', () => {
  const jpeg = { type: 'image/jpeg', size: 400_000 };

  it('accepts an image with room left', () => {
    expect(validateUpload(jpeg, 0).ok).toBe(true);
    expect(validateUpload(jpeg, MAX_PHOTOS_PER_KIND - 1).ok).toBe(true);
  });

  it('refuses non-images, empty and oversize files', () => {
    const notImage = validateUpload({ type: 'application/pdf', size: 10 }, 0);
    expect(notImage.ok === false && notImage.error.code).toBe('not_an_image');
    const empty = validateUpload({ type: 'image/png', size: 0 }, 0);
    expect(empty.ok === false && empty.error.code).toBe('empty_file');
    const big = validateUpload({ type: 'image/jpeg', size: MAX_UPLOAD_BYTES + 1 }, 0);
    expect(big.ok === false && big.error.code).toBe('too_large');
    expect(validateUpload({ type: 'image/jpeg', size: MAX_UPLOAD_BYTES }, 0).ok).toBe(true);
  });

  it('refuses the seventh photo of a kind', () => {
    const full = validateUpload(jpeg, MAX_PHOTOS_PER_KIND);
    expect(full.ok === false && full.error.code).toBe('too_many');
    expect(full.ok === false && full.error.message).toContain(String(MAX_PHOTOS_PER_KIND));
  });

  it('takes custom limits', () => {
    const r = validateUpload({ type: 'image/webp', size: 2000 }, 0, { maxBytes: 1000 });
    expect(r.ok === false && r.error.code).toBe('too_large');
    expect(validateUpload(jpeg, 1, { maxPerKind: 1 }).ok).toBe(false);
  });
});
