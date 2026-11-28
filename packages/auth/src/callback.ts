import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { safeNext } from './safe-next';
import { createServerSupabase } from './server';

/**
 * Route handler for /auth/callback. Handles both the PKCE `code` flow and the `token_hash`
 * flow Supabase uses for magic links, then sends the user on to `next`.
 *
 *   // app/auth/callback/route.ts
 *   export { GET } from '@speedy/auth/callback';
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get('next'));
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const supabase = await createServerSupabase();
  let failed = false;
  if (code) {
    failed = Boolean((await supabase.auth.exchangeCodeForSession(code)).error);
  } else if (tokenHash && type) {
    failed = Boolean((await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error);
  } else {
    failed = true;
  }

  if (failed) {
    const signIn = new URL('/sign-in', origin);
    signIn.searchParams.set('error', 'link');
    signIn.searchParams.set('next', next);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.redirect(new URL(next, origin));
}
