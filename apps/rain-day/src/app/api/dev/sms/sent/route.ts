import { getSms, isFakeSms } from '@/config/sms';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

/** Dev only: the texts the fake provider has "sent". 404 unless SMS_PROVIDER=fake outside production. */
export function GET() {
  if (env.SMS_PROVIDER !== 'fake' || env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }
  const provider = getSms();
  if (!isFakeSms(provider)) return new Response('Not found', { status: 404 });
  return Response.json({ sent: provider.sent });
}
