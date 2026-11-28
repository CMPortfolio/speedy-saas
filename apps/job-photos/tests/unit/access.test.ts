import { describe, expect, it } from 'vitest';

import { decideJobAccess, isExpired } from '@/features/jobs/access';

const now = new Date('2026-11-25T12:00:00Z');
const future = new Date(now.getTime() + 86_400_000).toISOString();
const past = new Date(now.getTime() - 1000).toISOString();

describe('decideJobAccess', () => {
  it('lets the owner in and nobody else once a job is owned', () => {
    const job = { owner_id: 'alice', expires_at: null };
    expect(decideJobAccess(job, 'alice', false, now)).toBe('owner');
    expect(decideJobAccess(job, 'bob', false, now)).toBe('none');
    expect(decideJobAccess(job, null, true, now)).toBe('none');
    expect(decideJobAccess(job, 'bob', true, now)).toBe('none');
  });

  it('lets the device in while an anonymous job is unexpired and the token matches', () => {
    const job = { owner_id: null, expires_at: future };
    expect(decideJobAccess(job, null, true, now)).toBe('device');
    expect(decideJobAccess(job, 'alice', true, now)).toBe('device');
    expect(decideJobAccess(job, null, false, now)).toBe('none');
    expect(decideJobAccess(job, 'alice', false, now)).toBe('none');
  });

  it('refuses an expired anonymous job even with the right token', () => {
    const job = { owner_id: null, expires_at: past };
    expect(decideJobAccess(job, null, true, now)).toBe('none');
  });
});

describe('isExpired', () => {
  it('only anonymous jobs expire', () => {
    expect(isExpired({ owner_id: null, expires_at: past }, now)).toBe(true);
    expect(isExpired({ owner_id: null, expires_at: future }, now)).toBe(false);
    expect(isExpired({ owner_id: 'a', expires_at: null }, now)).toBe(false);
  });
});
