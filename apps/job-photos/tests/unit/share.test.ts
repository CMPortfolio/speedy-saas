import { describe, expect, it } from 'vitest';

import { ogLayout, selectOgPhotos } from '@/features/jobs/og-selection';
import { checkReviewUrl, reviewUrlSchema } from '@/features/jobs/review-url';
import { shareState } from '@/features/jobs/share-state';

const now = new Date('2026-11-25T12:00:00Z');
const soon = new Date(now.getTime() + 60_000).toISOString();
const ago = new Date(now.getTime() - 60_000).toISOString();

describe('shareState', () => {
  it('404s an unknown slug', () => {
    expect(shareState(null, now)).toBe('not_found');
    expect(shareState(undefined, now)).toBe('not_found');
  });

  it('expires anonymous jobs past expires_at and never owned ones', () => {
    expect(shareState({ owner_id: null, expires_at: ago }, now)).toBe('expired');
    expect(shareState({ owner_id: null, expires_at: soon }, now)).toBe('ok');
    expect(shareState({ owner_id: 'u', expires_at: null }, now)).toBe('ok');
  });
});

describe('review url', () => {
  it('accepts https links only', () => {
    expect(reviewUrlSchema.safeParse('https://g.page/r/abc/review').success).toBe(true);
    expect(reviewUrlSchema.safeParse(' https://www.yelp.com/biz/x ').success).toBe(true);
    expect(reviewUrlSchema.safeParse('http://g.page/r/abc').success).toBe(false);
    expect(reviewUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(reviewUrlSchema.safeParse('g.page/r/abc').success).toBe(false);
    expect(reviewUrlSchema.safeParse('').success).toBe(false);
  });

  it('checkReviewUrl treats blank as no link and explains a bad one', () => {
    expect(checkReviewUrl('')).toBeNull();
    expect(checkReviewUrl(null)).toBeNull();
    expect(checkReviewUrl('https://example.com/review')).toEqual({
      ok: true,
      url: 'https://example.com/review',
    });
    const bad = checkReviewUrl('http://example.com');
    expect(bad?.ok).toBe(false);
    expect(bad && !bad.ok && bad.message).toMatch(/https/);
  });
});

describe('open graph photo selection', () => {
  const photos = [
    { id: 'b2', kind: 'before', position: 1 },
    { id: 'a1', kind: 'after', position: 0 },
    { id: 'b1', kind: 'before', position: 0 },
  ] as const;

  it('picks the first before and after by position', () => {
    const sel = selectOgPhotos(photos);
    expect(sel.before?.id).toBe('b1');
    expect(sel.after?.id).toBe('a1');
    expect(ogLayout(sel)).toBe('pair');
  });

  it('falls back to a single photo, then the brand card', () => {
    const onlyAfter = selectOgPhotos(photos.filter((p) => p.kind === 'after'));
    expect(onlyAfter.before).toBeNull();
    expect(ogLayout(onlyAfter)).toBe('single');
    expect(ogLayout(selectOgPhotos([]))).toBe('brand');
  });
});
