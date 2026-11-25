'use server';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { revalidatePath } from 'next/cache';

import { runSaveSetup, type SetupState } from './save-setup';

/** Server action behind the setup form. Writes through the owner's own session, so RLS applies. */
export async function saveSetup(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const user = await requireUser('/setup');
  const state = await runSaveSetup(await createServerSupabase(), user.id, formData);
  if (state.status === 'saved') revalidatePath('/setup');
  return state;
}
