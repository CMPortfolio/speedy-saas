import { z } from 'zod';

import { devSmsGuard } from '@/lib/dev-guard';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  from: z.string().regex(/^\+1[2-9][0-9]{9}$/),
  /** The owner's texting number that was texted. Defaults to the signed-in owner's. */
  to: z
    .string()
    .regex(/^\+1[2-9][0-9]{9}$/)
    .optional(),
  body: z.string().max(1600),
  providerMessageId: z.string().min(1).optional(),
});

/**
 * Dev only, signed-in only: post a signed inbound text to our own inbound webhook, as the
 * provider would.
 */
export async function POST(request: Request) {
  const guard = await devSmsGuard();
  if ('response' in guard) return guard.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response('Bad Request', { status: 400 });
  const to = parsed.data.to ?? guard.senderNumber;
  if (!to)
    return new Response('Set a sender number first (POST /api/dev/sms/sender)', { status: 400 });
  const signed = guard.provider.inbound({
    kind: 'inbound',
    from: parsed.data.from as `+1${string}`,
    to: to as `+1${string}`,
    body: parsed.data.body,
    providerMessageId: parsed.data.providerMessageId ?? `FAKE-IN-${crypto.randomUUID()}`,
  });
  const res = await fetch(new URL('/api/sms/inbound', request.url), {
    method: 'POST',
    headers: signed.headers as Record<string, string>,
    body: signed.rawBody,
  });
  return new Response(null, { status: res.status });
}
