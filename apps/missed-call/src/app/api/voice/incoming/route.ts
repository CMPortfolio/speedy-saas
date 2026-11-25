import 'server-only';

import { createServiceSupabase } from '@speedy/auth/server';
import { after } from 'next/server';

import { getSms } from '@/config/sms';
import { supabaseStore } from '@/features/missed-calls/store';
import { handleVoiceWebhook } from '@/features/missed-calls/voice-webhook';

export const dynamic = 'force-dynamic';

/**
 * Twilio posts here when a call comes in (direct or forwarded) and when its status changes.
 * The signature is checked before anything else; see handleVoiceWebhook.
 */
export function POST(request: Request) {
  return handleVoiceWebhook(request, {
    provider: getSms(),
    getStore: () => supabaseStore(createServiceSupabase()),
    defer: (task) => after(task),
  });
}
