import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithOtp = vi.fn();
let originHeader: string | null = null;

vi.mock('./server', () => ({
  createServerSupabase: async () => ({ auth: { signInWithOtp, signOut: vi.fn() } }),
}));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => (name === 'origin' ? originHeader : null) }),
}));

import { sendMagicLink } from './actions';

const form = (email: string, next?: string) => {
  const f = new FormData();
  f.set('email', email);
  if (next) f.set('next', next);
  return f;
};
const redirectTo = () =>
  (signInWithOtp.mock.calls[0]?.[0] as { options: { emailRedirectTo: string } }).options
    .emailRedirectTo;

beforeEach(() => {
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  originHeader = null;
});
afterEach(() => vi.unstubAllEnvs());

describe('sendMagicLink redirect', () => {
  it('uses APP_URL, not a spoofed Origin header', async () => {
    vi.stubEnv('APP_URL', 'https://missed-call.naplesaiagency.com');
    originHeader = 'https://evil.example';
    const r = await sendMagicLink({ status: 'idle' }, form('owner@resend.dev', '/setup'));
    expect(r).toEqual({ status: 'sent', email: 'owner@resend.dev' });
    expect(redirectTo()).toBe('https://missed-call.naplesaiagency.com/auth/callback?next=%2Fsetup');
  });

  it('falls back to the Origin header in local development', async () => {
    vi.stubEnv('APP_URL', '');
    originHeader = 'http://localhost:3002';
    await sendMagicLink({ status: 'idle' }, form('owner@resend.dev', '/calls'));
    expect(redirectTo()).toBe('http://localhost:3002/auth/callback?next=%2Fcalls');
  });

  it('then to localhost:3000 with neither', async () => {
    vi.stubEnv('APP_URL', '');
    await sendMagicLink({ status: 'idle' }, form('owner@resend.dev'));
    expect(redirectTo()).toBe('http://localhost:3000/auth/callback?next=%2F');
  });

  it('ignores an APP_URL that is not an http(s) URL', async () => {
    vi.stubEnv('APP_URL', 'not-a-url');
    originHeader = 'http://localhost:3001';
    await sendMagicLink({ status: 'idle' }, form('owner@resend.dev'));
    expect(redirectTo().startsWith('http://localhost:3001/auth/callback')).toBe(true);
  });

  it('throws in production when APP_URL is missing, so no email goes out with a wrong link', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', '');
    originHeader = 'https://evil.example';
    await expect(sendMagicLink({ status: 'idle' }, form('owner@resend.dev'))).rejects.toThrow(
      /APP_URL/,
    );
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
