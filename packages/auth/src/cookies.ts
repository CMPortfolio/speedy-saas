import type { CookieOptions } from '@supabase/ssr';

/**
 * Cookie options shared by the server client, browser client and middleware. The domain comes
 * from AUTH_COOKIE_DOMAIN so production can set `.naplesaiagency.com` and sign in once across
 * every tool. Locally it is unset and cookies stay on localhost.
 */
export function authCookieOptions(domain: string | undefined, secure: boolean): CookieOptions {
  return {
    ...(domain ? { domain } : {}),
    path: '/',
    sameSite: 'lax',
    secure,
    maxAge: 60 * 60 * 24 * 30,
  };
}

/**
 * The PKCE code verifier is the secret a magic-link sign-in is finished with. Supabase stores it in
 * one fixed cookie per project (`<storageKey>-code-verifier`). The session cookie is shared across
 * every tool on purpose, but if the verifier were shared too, asking for a link on one tool would
 * replace the verifier of a link still waiting on another, and that link would fail as "expired or
 * already used". So each tool keeps its own verifier, host-only and named for the tool.
 */
const VERIFIER_NAME = /-code-verifier$/;
const SCOPE_MARK = '~';

/** A short name for this tool, from its public origin, safe to put in a cookie name. */
export function verifierScope(origin: string): string {
  return new URL(origin).hostname.replace(/[^A-Za-z0-9-]/g, '-').toLowerCase();
}

interface PlainCookie {
  name: string;
  value: string;
}
interface SetCookie extends PlainCookie {
  options: CookieOptions;
}

/**
 * Wrap a server client's cookie methods so verifier cookies are per tool: written host-only under a
 * name carrying the tool, and read back under the plain name. A verifier that is not this tool's
 * (another tool's, or the old shared one) is invisible here. Everything else, the session above
 * all, passes through untouched on the shared domain.
 */
export function scopedCookieMethods(
  base: { getAll: () => PlainCookie[]; setAll: (cookies: SetCookie[]) => void },
  scope: string,
): { getAll: () => PlainCookie[]; setAll: (cookies: SetCookie[]) => void } {
  const suffix = `${SCOPE_MARK}${scope}`;
  return {
    getAll: () =>
      base.getAll().flatMap((cookie) => {
        if (cookie.name.endsWith(suffix)) {
          const plain = cookie.name.slice(0, -suffix.length);
          return VERIFIER_NAME.test(plain) ? [{ ...cookie, name: plain }] : [cookie];
        }
        // A verifier with no scope or another tool's scope is not ours.
        return VERIFIER_NAME.test(cookie.name) ||
          cookie.name.includes(`-code-verifier${SCOPE_MARK}`)
          ? []
          : [cookie];
      }),
    setAll: (cookies) =>
      base.setAll(
        cookies.map((cookie) => {
          if (!VERIFIER_NAME.test(cookie.name)) return cookie;
          // Host-only: no `domain`, so it is neither sent to nor readable by another tool.
          const { domain: _shared, ...hostOnly } = cookie.options;
          return { ...cookie, name: `${cookie.name}${suffix}`, options: hostOnly };
        }),
      ),
  };
}
