import { NextResponse } from 'next/server';

import { getSms } from '@/config/sms';

export const dynamic = 'force-dynamic';

/**
 * Dev and e2e only: the texts the fake provider has "sent", newest last. It exists only when the
 * fake provider is running, which the SMS guard allows only outside production, or in a local
 * production build with ALLOW_FAKE_SMS=1 and a localhost APP_URL. Anywhere else this is a 404.
 */
export function GET() {
  let provider;
  try {
    provider = getSms();
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (provider.name !== 'fake' || !('sent' in provider))
    return new NextResponse(null, { status: 404 });
  const sent = (provider as unknown as { sent: { to: string; from: string; body: string }[] }).sent;
  return NextResponse.json({ sent: sent.map(({ to, from, body }) => ({ to, from, body })) });
}
