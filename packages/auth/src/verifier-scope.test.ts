import { createHash } from 'node:crypto';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { describe, expect, it } from 'vitest';

import { authCookieOptions, scopedCookieMethods, verifierScope } from './cookies';

/**
 * The sign-in session cookie is shared across tools on .naplesaiagency.com on purpose (one
 * sign-in everywhere). The PKCE code verifier that goes with a magic link must not be: it is one
 * fixed cookie name per Supabase project, so asking for a link on one tool replaced the verifier of
 * a link still waiting on another, and that link then failed with "expired or already used".
 */
const URL_ = 'http://supabase.test';
const KEY = 'anon';
const DOMAIN = '.naplesaiagency.com';

interface Stored {
  name: string;
  value: string;
  options: CookieOptions;
  /** Set for a host-only cookie: only this host gets it back. */
  host?: string;
}

/** A browser cookie jar: the domain a cookie was set for decides which hosts get it back. */
class Jar {
  readonly cookies = new Map<string, Stored>();
  private static key(host: string, name: string, options: CookieOptions) {
    return options.domain ? `${options.domain}|${name}` : `${host}|${name}`;
  }
  /** The cookies the browser would send to this host. */
  for(host: string): { name: string; value: string }[] {
    return [...this.cookies.values()]
      .filter((c) =>
        c.host ? c.host === host : host.endsWith((c.options.domain ?? '').replace(/^\./, '')),
      )
      .map((c) => ({ name: c.name, value: c.value }));
  }
  /** What the browser does with Set-Cookie from a response on this host. */
  set(host: string, name: string, value: string, options: CookieOptions) {
    const key = Jar.key(host, name, options);
    if (!value || options.maxAge === 0) this.cookies.delete(key);
    else this.cookies.set(key, { name, value, options, ...(options.domain ? {} : { host }) });
  }
  named(part: string): Stored[] {
    return [...this.cookies.values()].filter((c) => c.name.includes(part));
  }
}

/** One tool: a server client on its own host that talks to a fake Supabase and the shared jar. */
function tool(jar: Jar, host: string, scoped: boolean) {
  const sent: { challenge: string | undefined; verifier: string | undefined } = {
    challenge: undefined,
    verifier: undefined,
  };
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
    if (url.includes('/otp')) sent.challenge = body.code_challenge;
    if (url.includes('/token')) sent.verifier = body.code_verifier;
    const ok = url.includes('/token')
      ? {
          access_token: 'a',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'r',
          user: {
            id: 'u',
            aud: 'authenticated',
            email: 'o@resend.dev',
            app_metadata: {},
            user_metadata: {},
            created_at: '',
          },
        }
      : {};
    return new Response(JSON.stringify(ok), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const base = {
    getAll: () => jar.for(host),
    setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
      for (const c of toSet) jar.set(host, c.name, c.value, c.options);
    },
  };
  const client = createServerClient(URL_, KEY, {
    cookieOptions: authCookieOptions(DOMAIN, true),
    cookies: scoped ? scopedCookieMethods(base, verifierScope(`https://${host}`)) : base,
    global: { fetch: fakeFetch },
  });
  return { client, sent };
}

const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

async function twoLinksThenExchangeTheFirst(scoped: boolean) {
  const jar = new Jar();
  const missedCall = tool(jar, 'missed-call.naplesaiagency.com', scoped);
  const rainDay = tool(jar, 'rain-day.naplesaiagency.com', scoped);
  await missedCall.client.auth.signInWithOtp({ email: 'o@resend.dev' });
  await rainDay.client.auth.signInWithOtp({ email: 'o@resend.dev' });
  // The owner now opens the link they asked for on Missed Call first.
  const back = tool(jar, 'missed-call.naplesaiagency.com', scoped);
  await back.client.auth.exchangeCodeForSession('code-from-the-missed-call-link');
  return {
    jar,
    missedCallChallenge: missedCall.sent.challenge,
    rainDayChallenge: rainDay.sent.challenge,
    back,
  };
}

describe('the PKCE verifier is per tool, the session is shared', () => {
  it('with one shared verifier cookie (the old behaviour), a second tool breaks the first tool’s link', async () => {
    const { missedCallChallenge, back } = await twoLinksThenExchangeTheFirst(false);
    expect(missedCallChallenge).toBeTruthy();
    expect(s256(back.sent.verifier!)).not.toBe(missedCallChallenge);
  });

  it('with per-tool verifiers, each tool’s link still exchanges with its own verifier', async () => {
    const { missedCallChallenge, rainDayChallenge, back } =
      await twoLinksThenExchangeTheFirst(true);
    expect(missedCallChallenge).not.toBe(rainDayChallenge);
    expect(s256(back.sent.verifier!)).toBe(missedCallChallenge);
  });

  it('the verifier cookie is host-only and named for its tool, never on the shared domain', async () => {
    const { jar } = await twoLinksThenExchangeTheFirst(true);
    const verifiers = jar.named('-code-verifier');
    expect(verifiers.length).toBeGreaterThan(0);
    for (const stored of verifiers) {
      // Every verifier cookie (the fixed one, the pending-flow index, a flow slot) is host-only and
      // carries the name of the one tool whose host it belongs to.
      expect(stored.options.domain).toBeUndefined();
      expect(stored.host).toBeDefined();
      expect(stored.name.endsWith(`~${verifierScope(`https://${stored.host}`)}`)).toBe(true);
    }
    // Rain day's link is still waiting: its own verifier is there, and Missed Call cannot see it.
    expect(verifiers.some((c) => c.host === 'rain-day.naplesaiagency.com')).toBe(true);
    expect(
      jar.for('missed-call.naplesaiagency.com').every((c) => !c.name.includes('~rain-day')),
    ).toBe(true);
  });

  it('the signed-in session still lands on the shared domain, so one sign-in works on every tool', async () => {
    const { jar } = await twoLinksThenExchangeTheFirst(true);
    const session = jar.named('auth-token').filter((c) => !c.name.includes('code-verifier'));
    expect(session.length).toBeGreaterThan(0);
    for (const c of session) expect(c.options.domain).toBe(DOMAIN);
    // And Rain day sees the session Missed Call just made.
    const seen = jar.for('rain-day.naplesaiagency.com').map((c) => c.name);
    expect(seen.some((n) => n.includes('auth-token') && !n.includes('code-verifier'))).toBe(true);
  });
});

describe('verifierScope', () => {
  it('names a tool by its host, safe for a cookie name', () => {
    expect(verifierScope('https://rain-day.naplesaiagency.com')).toBe(
      'rain-day-naplesaiagency-com',
    );
    expect(verifierScope('http://localhost:3003')).toBe('localhost');
  });
});
