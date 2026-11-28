import { describe, expect, it } from 'vitest';

import {
  canClaim,
  claimRequestSchema,
  decodeDataUrl,
  profilePatchFromDevice,
} from '@/features/jobs/claims';

const ID = '3f2a2c9e-5b3d-4c1a-9f0e-2b7a1d6c8e10';

describe('claimRequestSchema', () => {
  it('accepts a list of id/token pairs with optional business details', () => {
    const parsed = claimRequestSchema.safeParse({
      claims: [{ id: ID, token: 'abc' }],
      business: { name: ' Gulf Coast Cooling ', logoDataUrl: 'data:image/png;base64,AAAA' },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.business?.name).toBe('Gulf Coast Cooling');
  });

  it('rejects bad ids, empty tokens, too many claims and non-image data urls', () => {
    expect(claimRequestSchema.safeParse({ claims: [{ id: 'x', token: 't' }] }).success).toBe(false);
    expect(claimRequestSchema.safeParse({ claims: [{ id: ID, token: '' }] }).success).toBe(false);
    const many = Array.from({ length: 201 }, () => ({ id: ID, token: 't' }));
    expect(claimRequestSchema.safeParse({ claims: many }).success).toBe(false);
    expect(
      claimRequestSchema.safeParse({
        claims: [],
        business: { logoDataUrl: 'data:text/html;base64,AAAA' },
      }).success,
    ).toBe(false);
  });
});

describe('canClaim', () => {
  it('only claims unowned jobs with a matching token', () => {
    const anon = { owner_id: null, claim_token_hash: 'h' };
    expect(canClaim(anon, true)).toBe(true);
    expect(canClaim(anon, false)).toBe(false);
    expect(canClaim({ owner_id: 'someone', claim_token_hash: null }, true)).toBe(false);
    expect(canClaim({ owner_id: null, claim_token_hash: null }, true)).toBe(false);
    expect(canClaim(null, true)).toBe(false);
  });
});

describe('decodeDataUrl', () => {
  it('decodes image data urls and refuses everything else', () => {
    const png = decodeDataUrl('data:image/png;base64,AQID');
    expect(png?.contentType).toBe('image/png');
    expect(Array.from(png?.bytes ?? [])).toEqual([1, 2, 3]);
    expect(decodeDataUrl('https://example.com/x.png')).toBeNull();
    expect(decodeDataUrl('data:image/png,notbase64')).toBeNull();
  });
});

describe('profilePatchFromDevice', () => {
  it('fills only what the profile is missing', () => {
    expect(profilePatchFromDevice(null, { name: 'Gulf Coast Cooling' }, 'logos/u/a.png')).toEqual({
      business_name: 'Gulf Coast Cooling',
      logo_path: 'logos/u/a.png',
    });
    expect(
      profilePatchFromDevice(
        { business_name: 'Already Set', logo_path: null },
        { name: 'New Name' },
        'logos/u/a.png',
      ),
    ).toEqual({ logo_path: 'logos/u/a.png' });
    expect(
      profilePatchFromDevice(
        { business_name: 'Already', logo_path: 'logos/u/old.png' },
        { name: 'x' },
        'logos/u/new.png',
      ),
    ).toEqual({});
    expect(profilePatchFromDevice(null, { name: '   ' }, null)).toEqual({});
    expect(profilePatchFromDevice(null, undefined, null)).toEqual({});
  });
});
