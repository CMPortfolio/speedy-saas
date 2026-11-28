import type { Database } from '@speedy/db/types';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { authCookieOptions } from './cookies';

export interface UpdateSessionOptions {
  /** Paths that need a signed-in user; others are left alone. Prefix match. */
  protectedPaths?: readonly string[];
  /** Where to send signed-out users who hit a protected path. Default "/sign-in". */
  signInPath?: string;
}

/**
 * Refresh the Supabase session on every request and carry the refreshed cookies to the
 * browser. Call this from each app's middleware.ts:
 *
 *   export async function middleware(request: NextRequest) {
 *     return updateSession(request, { protectedPaths: ['/jobs'] });
 *   }
 *   export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'] };
 */
export async function updateSession(
  request: NextRequest,
  options: UpdateSessionOptions = {},
): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient<Database>(url, anonKey, {
    cookieOptions: authCookieOptions(
      process.env.AUTH_COOKIE_DOMAIN,
      request.nextUrl.protocol === 'https:',
    ),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options: cookieOptions } of toSet)
          response.cookies.set(name, value, cookieOptions);
      },
    },
  });

  // getUser() validates the token with Supabase and refreshes it when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsUser = (options.protectedPaths ?? []).some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  if (!user && needsUser) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = options.signInPath ?? '/sign-in';
    signIn.searchParams.set('next', `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(signIn);
  }
  return response;
}
