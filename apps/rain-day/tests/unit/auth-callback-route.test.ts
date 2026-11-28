import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const seen: NextRequest[] = [];
vi.mock('@speedy/auth/callback', () => ({
  GET: async (request: NextRequest) => {
    seen.push(request);
    return NextResponse.redirect(new URL('/', request.nextUrl.origin));
  },
}));

const { GET } = await import('@/app/auth/callback/route');

function call(query: string, headers: Record<string, string> = {}) {
  return GET(new NextRequest(`https://rain-day.example.com/auth/callback?${query}`, { headers }));
}

describe('/auth/callback', () => {
  it('sends a page from another tool to Rain day instead of a 404', async () => {
    await call('token_hash=abc&type=magiclink&next=%2Fsetup');
    const forwarded = seen.at(-1)!;
    expect(forwarded.nextUrl.searchParams.get('next')).toBe('/rain-day');
    // Everything else the shared handler needs is passed along untouched.
    expect(forwarded.nextUrl.searchParams.get('token_hash')).toBe('abc');
    expect(forwarded.nextUrl.searchParams.get('type')).toBe('magiclink');
  });

  it('keeps a page that is ours, with its query', async () => {
    await call('code=xyz&next=%2Frain-day%3Ffrom%3D2026-12-01');
    expect(seen.at(-1)!.nextUrl.searchParams.get('next')).toBe('/rain-day?from=2026-12-01');
  });

  it('uses Rain day when there is no next at all, and keeps the cookies the shared handler reads', async () => {
    await call('code=xyz', { cookie: 'sb-x-auth-token-code-verifier=abc' });
    const forwarded = seen.at(-1)!;
    expect(forwarded.nextUrl.searchParams.get('next')).toBe('/rain-day');
    expect(forwarded.cookies.get('sb-x-auth-token-code-verifier')?.value).toBe('abc');
  });
});
