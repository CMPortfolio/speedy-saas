'use client';

import type { Database } from '@speedy/db/types';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { authCookieOptions } from './cookies';
import { authEnv } from './env';

let browserClient: SupabaseClient<Database> | undefined;

/** Supabase client for client components. One instance per tab. Anon key only. */
export function createBrowserSupabase(): SupabaseClient<Database> {
  browserClient ??= createBrowserClient<Database>(
    authEnv.NEXT_PUBLIC_SUPABASE_URL,
    authEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: authCookieOptions(
        process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN,
        typeof window !== 'undefined' && window.location.protocol === 'https:',
      ),
    },
  );
  return browserClient;
}
