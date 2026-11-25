import { createServerSupabase } from '@speedy/auth/server';

import { env } from '@/config/env';
import { getOwnerSettings } from '@/features/settings/owner-cell';

import { isPracticeOwner } from './gate';

/**
 * Whether the signed-in owner is in practice mode, read on the server from their own settings.
 * Pages use it to show or hide the practice screens; the practice actions check it again.
 */
export async function ownerIsInPractice(): Promise<boolean> {
  const settings = await getOwnerSettings(await createServerSupabase());
  return isPracticeOwner(settings, env.SMS_PROVIDER);
}
