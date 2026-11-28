import type { Database } from '@speedy/db/types';
import { logger } from '@speedy/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

import { saveLine } from './line-queries';
import { parseSetup, type SetupField } from './schema';

const log = logger.child({ feature: 'setup' });

export type SetupState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'invalid'; errors: Partial<Record<SetupField, string>> }
  | { status: 'error'; message: string };

export const idleSetup: SetupState = { status: 'idle' };

/** The work behind the setup form. Never throws: a failure becomes a message the owner sees. */
export async function runSaveSetup(
  client: SupabaseClient<Database>,
  userId: string,
  formData: FormData,
): Promise<SetupState> {
  const parsed = parseSetup(formData);
  if (!parsed.ok) return { status: 'invalid', errors: parsed.errors };
  try {
    await saveLine(client, userId, parsed.value);
    return { status: 'saved' };
  } catch (e) {
    log.warn('could not save setup', { error: e });
    return {
      status: 'error',
      message: 'We could not save that. Check your connection and try again.',
    };
  }
}
