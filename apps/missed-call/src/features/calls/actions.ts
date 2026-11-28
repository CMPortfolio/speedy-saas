'use server';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { revalidatePath } from 'next/cache';

import { runMarkCall } from './mark-action';
import type { MarkState } from './mark-state';

/** Server action behind the Called back / Booked / Junk buttons. The database limits it to the owner's own calls. */
export async function setCallStatus(_prev: MarkState, formData: FormData): Promise<MarkState> {
  await requireUser('/calls');
  const state = await runMarkCall(await createServerSupabase(), formData);
  if (state.status === 'done') revalidatePath('/calls');
  return state;
}
