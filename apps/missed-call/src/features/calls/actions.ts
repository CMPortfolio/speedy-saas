'use server';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { logger } from '@speedy/lib/logger';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { markCall } from './queries';

const log = logger.child({ feature: 'calls' });

const markSchema = z.object({
  callId: z.uuid(),
  status: z.enum(['called_back', 'booked', 'junk']),
});

/** Server action behind the Called back / Booked / Junk buttons. RLS limits it to the owner's own calls. */
export async function setCallStatus(formData: FormData): Promise<void> {
  await requireUser('/calls');
  const parsed = markSchema.safeParse({
    callId: formData.get('callId'),
    status: formData.get('status'),
  });
  if (!parsed.success) return;
  try {
    await markCall(await createServerSupabase(), parsed.data.callId, parsed.data.status);
  } catch (e) {
    log.warn('could not mark call', { error: e });
  }
  revalidatePath('/calls');
}
