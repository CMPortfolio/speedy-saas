import { updateSession } from '@speedy/auth/middleware';
import type { NextRequest } from 'next/server';

/** Refreshes the Supabase session on every request. Add paths that need sign-in to protectedPaths. */
export function proxy(request: NextRequest) {
  return updateSession(request, { protectedPaths: [] });
}

export const config = {
  matcher: [
    '/((?!api/voice/|api/sms/|_next/static|_next/image|favicon.ico|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)',
  ],
};
