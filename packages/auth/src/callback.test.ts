import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();

vi.mock('./server', () => ({
  createServerSupabase: async () => ({ auth: { verifyOtp, exchangeCodeForSession } }),
}));

import { GET } from './callback';

/** Behind Railway the request URL is the container's own address, not the public one. */
const INTERNAL = 'https://localhost:8080';
const PUBLIC = 'https://job-photos.naplesaiagency.com';

const request = (query: string) => new NextRequest(`${INTERNAL}/auth/callback?${query}`);

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ error: null });
  exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv('APP_URL', PUBLIC);
});
afterEach(() => vi.unstubAllEnvs());

describe('auth callback redirects', () => {
  it('sends a signed-in user to the public origin, keeping the path from next', async () => {
    const res = await GET(request('token_hash=abc&type=magiclink&next=/jobs/new%3Fa%3D1'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`${PUBLIC}/jobs/new?a=1`);
  });

  it('does the same for the PKCE code flow', async () => {
    const res = await GET(request('code=xyz&next=/setup'));
    expect(res.headers.get('location')).toBe(`${PUBLIC}/setup`);
  });

  it('sends a failed link to /sign-in on the public origin, with the error and next', async () => {
    verifyOtp.mockResolvedValue({ error: new Error('expired') });
    const res = await GET(request('token_hash=abc&type=magiclink&next=/calls'));
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.origin).toBe(PUBLIC);
    expect(location.pathname).toBe('/sign-in');
    expect(location.searchParams.get('error')).toBe('link');
    expect(location.searchParams.get('next')).toBe('/calls');
  });

  it('a request with no token is a failed link on the public origin too', async () => {
    const res = await GET(request('next=/calls'));
    expect(new URL(res.headers.get('location') ?? '').origin).toBe(PUBLIC);
  });

  it('still refuses an off-site next (safeNext) and lands on the public origin root', async () => {
    const res = await GET(request('token_hash=abc&type=magiclink&next=//evil.example/x'));
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.origin).toBe(PUBLIC);
    expect(location.hostname).not.toBe('evil.example');
  });

  it('uses the request origin in local development, where APP_URL is not set', async () => {
    vi.stubEnv('APP_URL', '');
    const res = await GET(request('token_hash=abc&type=magiclink&next=/setup'));
    expect(res.headers.get('location')).toBe(`${INTERNAL}/setup`);
  });
});
