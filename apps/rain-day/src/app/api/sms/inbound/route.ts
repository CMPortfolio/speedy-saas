import { createServiceSupabase } from '@speedy/auth/server';

import { env } from '@/config/env';
import { getSms } from '@/config/sms';
import { handleInboundWebhook } from '@/features/replies/inbound-webhook';

export const dynamic = 'force-dynamic';

/** Texts customers send back. Signed by the provider; forged calls get 403. */
export function POST(request: Request) {
  return handleInboundWebhook(request, {
    provider: getSms(),
    getDb: createServiceSupabase,
    publicUrl: env.SMS_WEBHOOK_PUBLIC_URL ?? env.APP_URL,
  });
}
