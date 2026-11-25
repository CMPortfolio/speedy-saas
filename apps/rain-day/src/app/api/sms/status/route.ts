import { createServiceSupabase } from '@speedy/auth/server';

import { getSms } from '@/config/sms';
import { handleStatusWebhook } from '@/features/rain-day/status-webhook';

export const dynamic = 'force-dynamic';

/** Delivery receipts for the texts we sent. Signed by the provider; forged calls get 403. */
export function POST(request: Request) {
  return handleStatusWebhook(request, { provider: getSms(), getDb: createServiceSupabase });
}
