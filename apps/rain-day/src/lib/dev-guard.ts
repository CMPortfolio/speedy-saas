import { createServerSupabase } from '@speedy/auth/server';
import { getOptionalUser } from '@speedy/auth/user';

import { env } from '@/config/env';
import { getSms, isFakeSms } from '@/config/sms';
import { getOwnerSettings } from '@/features/settings/owner-cell';

/**
 * Gate for /api/dev/sms/*: 404 unless SMS_PROVIDER=fake outside production, and 401 unless an
 * owner is signed in. Returns the fake provider, or a Response to send back.
 */
export async function devSmsGuard() {
  if (env.SMS_PROVIDER !== 'fake' || env.NODE_ENV === 'production') {
    return { response: new Response('Not found', { status: 404 }) } as const;
  }
  const provider = getSms();
  if (!isFakeSms(provider))
    return { response: new Response('Not found', { status: 404 }) } as const;
  const user = await getOptionalUser();
  if (!user) return { response: new Response('Sign in first', { status: 401 }) } as const;
  const settings = await getOwnerSettings(await createServerSupabase());
  return { provider, userId: user.id, senderNumber: settings?.sender_number ?? null } as const;
}
