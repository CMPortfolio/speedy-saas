import type { Database } from '@speedy/db/types';
import { logger } from '@speedy/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { MarkState } from './mark-state';
import { markCall } from './queries';

const log = logger.child({ feature: 'calls' });

const markSchema = z.object({
  callId: z.uuid(),
  status: z.enum(['called_back', 'booked', 'junk']),
});

/** The work behind the status buttons. Never throws: a failure becomes a message the owner sees. */
export async function runMarkCall(
  client: SupabaseClient<Database>,
  formData: FormData,
): Promise<MarkState> {
  const parsed = markSchema.safeParse({
    callId: formData.get('callId'),
    status: formData.get('status'),
  });
  if (!parsed.success) return { status: 'error', message: 'That did not go through. Try again.' };
  try {
    await markCall(client, parsed.data.callId, parsed.data.status);
    return { status: 'done' };
  } catch (e) {
    log.warn('could not mark call', { error: e });
    return {
      status: 'error',
      message: 'We could not save that. Check your connection and tap it again.',
    };
  }
}
