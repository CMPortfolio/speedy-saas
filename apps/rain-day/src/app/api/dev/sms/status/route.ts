import { z } from 'zod';

import { getSms, isFakeSms } from '@/config/sms';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  providerMessageId: z.string().min(1),
  status: z.enum(['queued', 'sent', 'delivered', 'failed', 'undelivered']),
});

/**
 * Dev only: post a signed delivery event to our own status webhook, as the provider would.
 * 404 unless SMS_PROVIDER=fake outside production.
 */
export async function POST(request: Request) {
  if (env.SMS_PROVIDER !== 'fake' || env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }
  const provider = getSms();
  if (!isFakeSms(provider)) return new Response('Not found', { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response('Bad Request', { status: 400 });
  const signed = provider.inbound({ kind: 'delivery', ...parsed.data });
  const res = await fetch(new URL('/api/sms/status', request.url), {
    method: 'POST',
    headers: signed.headers as Record<string, string>,
    body: signed.rawBody,
  });
  return new Response(null, { status: res.status });
}
