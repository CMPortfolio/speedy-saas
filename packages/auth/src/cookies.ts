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
/** Browsers only accept this prefix on a Secure, Path=/ cookie with no Domain: host-only, for sure. */
const HOST_PREFIX = '__Host-';

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
 * name carrying the tool, and read back under the plain name. Over https the name also gets the
 * `__Host-` prefix, so the browser itself refuses to let the cookie carry a Domain or be set from a
 * sibling subdomain. Over plain http (local development) the prefix is left off: browsers do not
 * accept a Secure cookie there, and sign-in would stop working. A verifier that is not this tool's
 * (another tool's, or the old shared one) is invisible here. Everything else, the session above
 * all, passes through untouched on the shared domain.
 */
export function scopedCookieMethods(
  base: { getAll: () => PlainCookie[]; setAll: (cookies: SetCookie[]) => void },
  scope: string,
  { secure }: { secure: boolean },
): { getAll: () => PlainCookie[]; setAll: (cookies: SetCookie[]) => void } {
  const suffix = `${SCOPE_MARK}${scope}`;
  // Secure (production, https): only the `__Host-` form counts. An unprefixed cookie of the same
  // name could have been planted from a sibling subdomain with a Domain attribute, which the
  // browser refuses for `__Host-` but not for a plain name. Not secure (plain http, local
  // development): only the plain form exists.
  const prefix = secure ? HOST_PREFIX : '';
  return {
    getAll: () =>
      base.getAll().flatMap((cookie) => {
        if (cookie.name.startsWith(prefix) && cookie.name.endsWith(suffix)) {
          const plain = cookie.name.slice(prefix.length, -suffix.length);
          if (VERIFIER_NAME.test(plain) && !plain.startsWith(HOST_PREFIX)) {
            return [{ ...cookie, name: plain }];
          }
        }
        // Any other verifier, however it is named, is not ours: the old shared one, another tool's,
        // or this tool's name in the wrong form for this environment.
        return cookie.name.includes('-code-verifier') ? [] : [cookie];
      }),
    setAll: (cookies) =>
      base.setAll(
        cookies.map((cookie) => {
          if (!VERIFIER_NAME.test(cookie.name)) return cookie;
          // Host-only: no `domain`, so it is neither sent to nor readable by another tool.
          const { domain: _shared, ...hostOnly } = cookie.options;
          const name = `${prefix}${cookie.name}${suffix}`;
          return secure
            ? { ...cookie, name, options: { ...hostOnly, secure: true, path: '/' } }
            : { ...cookie, name, options: hostOnly };
        }),
      ),
  };
}

/**
 * Whether auth cookies are Secure. One answer for the server client, the sign-in action, the callback
 * and the middleware, so they all name the verifier cookie the same way: production is https, local
 * development is not.
 */
export function cookiesAreSecure(): boolean {
  return process.env.NODE_ENV === 'production';
}
