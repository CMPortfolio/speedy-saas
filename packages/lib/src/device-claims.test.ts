import { describe, expect, it } from 'vitest';

import {
  constantTimeEqual,
  forgetClaims,
  hashClaimToken,
  listClaims,
  rememberClaim,
  verifyClaimToken,
  type ClaimStore,
} from './device-claims';

function fakeStore(): ClaimStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('device claims on the client', () => {
  it('remembers, lists and forgets claims per namespace', () => {
    const store = fakeStore();
    rememberClaim('job-photos', 'j1', 't1', store);
    rememberClaim('job-photos', 'j2', 't2', store);
    rememberClaim('other-tool', 'o1', 'x', store);

    expect(listClaims('job-photos', store).map((c) => c.id)).toEqual(['j1', 'j2']);
    expect(listClaims('other-tool', store).map((c) => c.id)).toEqual(['o1']);
    expect(listClaims('empty', store)).toEqual([]);

    forgetClaims('job-photos', ['j1'], store);
    expect(listClaims('job-photos', store).map((c) => c.id)).toEqual(['j2']);
    forgetClaims('job-photos', ['j2'], store);
    expect(store.map.has('speedy.claims.job-photos')).toBe(false);
  });

  it('replaces the token when the same id is remembered again', () => {
    const store = fakeStore();
    rememberClaim('job-photos', 'j1', 'old', store);
    rememberClaim('job-photos', 'j1', 'new', store);
    expect(listClaims('job-photos', store)).toHaveLength(1);
    expect(listClaims('job-photos', store)[0]?.token).toBe('new');
  });

  it('ignores garbage in storage and a missing store', () => {
    const store = fakeStore();
    store.setItem('speedy.claims.job-photos', '{not json');
    expect(listClaims('job-photos', store)).toEqual([]);
    store.setItem(
      'speedy.claims.job-photos',
      JSON.stringify([{ id: 1 }, { id: 'ok', token: 't' }]),
    );
    expect(listClaims('job-photos', store).map((c) => c.id)).toEqual(['ok']);
    expect(listClaims('job-photos', null)).toEqual([]);
    expect(() => rememberClaim('job-photos', 'a', 'b', null)).not.toThrow();
  });

  it('rejects namespaces that could collide with other keys', () => {
    expect(() => listClaims('Job Photos', fakeStore())).toThrow(RangeError);
    expect(() => listClaims('', fakeStore())).toThrow(RangeError);
  });
});

describe('device claims on the server', () => {
  it('hashes to sha-256 hex and never stores the token', async () => {
    const hash = await hashClaimToken('abc');
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hash).not.toContain('abc');
  });

  it('verifies a token against its hash only', async () => {
    const hash = await hashClaimToken('secret-token');
    await expect(verifyClaimToken('secret-token', hash)).resolves.toBe(true);
    await expect(verifyClaimToken('secret-token', hash.toUpperCase())).resolves.toBe(true);
    await expect(verifyClaimToken('other', hash)).resolves.toBe(false);
    await expect(verifyClaimToken('', hash)).resolves.toBe(false);
    await expect(verifyClaimToken('secret-token', null)).resolves.toBe(false);
  });

  it('constantTimeEqual compares whole strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
  });
});
