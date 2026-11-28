import { GET as signInCallback } from '@speedy/auth/callback';
import { NextRequest } from 'next/server';

import { rainDayNext } from '@/lib/next-path';

/**
 * The shared sign-in callback, with `next` limited to pages that exist in this app: a link that
 * names another tool's page (for example Missed Call's /setup) lands on Rain day instead of a 404.
 */
export function GET(request: NextRequest) {
  const url = new URL(request.url);
  url.searchParams.set('next', rainDayNext(url.searchParams.get('next')));
  return signInCallback(new NextRequest(url, request));
}
