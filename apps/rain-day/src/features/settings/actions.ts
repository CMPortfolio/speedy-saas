'use server';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { updateProfile } from '@speedy/db/core';
import { logger } from '@speedy/lib/logger';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { formValues, invalid, phoneField, type FormState } from '@/lib/form-state';

export type SettingsField = 'business_name' | 'phone';
export type SettingsFormState = FormState<SettingsField>;

const settingsSchema = z.object({
  business_name: z
    .string()
    .trim()
    .min(1, 'Enter your business name.')
    .max(120, 'Keep the business name under 120 characters.'),
  phone: phoneField,
});

/** Business name and owner cell live on public.profiles, shared by every tool. */
export async function saveSettings(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser('/settings');
  const parsed = settingsSchema.safeParse(formValues(formData, ['business_name', 'phone']));
  if (!parsed.success) return invalid(parsed.error.issues);

  const supabase = await createServerSupabase();
  try {
    await updateProfile(supabase, user.id, parsed.data);
  } catch (cause) {
    logger.warn('rain-day: save settings failed', { cause });
    return { status: 'error', message: 'We could not save that just now. Try again in a minute.' };
  }
  revalidatePath('/settings');
  return { status: 'saved' };
}
