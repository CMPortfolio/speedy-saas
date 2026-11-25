import 'server-only';

import type { Database } from '@speedy/db/types';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { appOrigin } from './app-origin';
import { authCookieOptions, scopedCookieMethods, verifierScope } from './cookies';
import { authEnv } from './env';

export type ServerSupabase = SupabaseClient<Database>;

/**
 * Supabase client for server components, server actions and route handlers. Reads the session
 * from cookies and writes refreshed tokens back where Next allows it (actions and handlers).
 */
export async function createServerSupabase(): Promise<ServerSupabase> {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    authEnv.NEXT_PUBLIC_SUPABASE_URL,
    authEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: authCookieOptions(
        authEnv.AUTH_COOKIE_DOMAIN,
        process.env.NODE_ENV === 'production',
      ),
      // The session is shared across tools; the sign-in verifier is this tool's own (see cookies.ts).
      cookies: scopedCookieMethods(
        {
          getAll: () => cookieStore.getAll(),
          setAll: (toSet) => {
            try {
              for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
            } catch {
              // Called from a Server Component: middleware refreshes the session instead.
            }
          },
        },
        verifierScope(appOrigin()),
      ),
    },
  );
}

/**
 * Service-role client. Bypasses RLS, so it is only for server routes that must act outside the
 * caller's own rows (public share pages by slug, provider webhooks, scheduled jobs).
 * Never import this from client-side code; `server-only` makes the build fail if you do.
 */
export function createServiceSupabase(): ServerSupabase {
  const key = authEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient<Database>(authEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
