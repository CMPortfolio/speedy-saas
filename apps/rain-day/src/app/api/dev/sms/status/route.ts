import { z } from 'zod';

import { devSmsGuard } from '@/lib/dev-guard';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  providerMessageId: z.string().min(1),
  status: z.enum(['queued', 'sent', 'delivered', 'failed', 'undelivered']),
});

/**
 * Dev only, signed-in only: post a signed delivery event to our own status webhook, as the
 * provider would.
 */
export async function POST(request: Request) {
  const guard = await devSmsGuard();
  if ('response' in guard) return guard.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response('Bad Request', { status: 400 });
  const signed = guard.provider.inbound({ kind: 'delivery', ...parsed.data });
  const res = await fetch(new URL('/api/sms/status', request.url), {
    method: 'POST',
    headers: signed.headers as Record<string, string>,
    body: signed.rawBody,
  });
  return new Response(null, { status: res.status });
}
