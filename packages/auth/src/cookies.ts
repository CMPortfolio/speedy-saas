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
