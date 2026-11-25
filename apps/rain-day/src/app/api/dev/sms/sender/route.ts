import { createServiceSupabase } from '@speedy/auth/server';
import { z } from 'zod';

import { devDefaultSender } from '@/config/sms';
import { devSmsGuard } from '@/lib/dev-guard';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  number: z
    .string()
    .regex(/^\+1[2-9][0-9]{9}$/)
    .optional(),
});

/**
 * Dev only, signed-in only: the stand-in for the admin who assigns an owner their texting number.
 * Sets the signed-in owner's sender number (default: SMS_FROM_NUMBER, or a made-up one).
 */
export async function POST(request: Request) {
  const guard = await devSmsGuard();
  if ('response' in guard) return guard.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return new Response('Bad Request', { status: 400 });
  const number = parsed.data.number ?? devDefaultSender();
  const { error } = await createServiceSupabase()
    .schema('rain_day')
    .from('owner_settings')
    .upsert({ owner_id: guard.userId, sender_number: number }, { onConflict: 'owner_id' });
  if (error)
    return new Response('Could not set the number', { status: error.code === '23505' ? 409 : 500 });
  return Response.json({ senderNumber: number });
}
