import 'server-only';

import { createServiceSupabase } from '@speedy/auth/server';

import { getSms } from '@/config/sms';
import { handleInboundSmsWebhook } from '@/features/missed-calls/sms-webhook';
import { supabaseStore } from '@/features/missed-calls/store';

export const dynamic = 'force-dynamic';

/** Twilio posts here when someone texts the business number. The signature is checked first. */
export function POST(request: Request) {
  return handleInboundSmsWebhook(request, {
    provider: getSms(),
    getStore: () => supabaseStore(createServiceSupabase()),
  });
}
