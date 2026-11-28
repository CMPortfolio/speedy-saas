'use server';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { logger } from '@speedy/lib/logger';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { formValues, invalid, type FormState } from '@/lib/form-state';

import {
  CUSTOMER_FIELDS,
  customerFormSchema,
  importRowsSchema,
  type CustomerField,
} from './schema';

export type CustomerFormState = FormState<CustomerField>;

const UNIQUE_VIOLATION = '23505';
const SAVE_FAILED = 'We could not save that just now. Try again in a minute.';
const DUPLICATE = 'You already have a customer with that number.';

function saveError(code: string | undefined): CustomerFormState {
  return { status: 'error', message: code === UNIQUE_VIOLATION ? DUPLICATE : SAVE_FAILED };
}

export async function createCustomer(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await requireUser('/customers/new');
  const parsed = customerFormSchema.safeParse(formValues(formData, CUSTOMER_FIELDS));
  if (!parsed.success) return invalid(parsed.error.issues);

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .schema('rain_day')
    .from('customers')
    .insert({ owner_id: user.id, ...parsed.data });
  if (error) {
    logger.warn('rain-day: create customer failed', { code: error.code });
    return saveError(error.code);
  }
  revalidatePath('/customers');
  redirect('/customers');
}

export async function updateCustomer(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return { status: 'error', message: SAVE_FAILED };
  await requireUser(`/customers/${id.data}/edit`);
  const parsed = customerFormSchema.safeParse(formValues(formData, CUSTOMER_FIELDS));
  if (!parsed.success) return invalid(parsed.error.issues);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema('rain_day')
    .from('customers')
    .update(parsed.data)
    .eq('id', id.data)
    .select('id');
  if (error) {
    logger.warn('rain-day: update customer failed', { code: error.code });
    return saveError(error.code);
  }
  if (data.length === 0) return { status: 'error', message: 'That customer is no longer here.' };
  revalidatePath('/customers');
  redirect('/customers');
}

export type DeleteResult = { ok: true } | { ok: false; message: string };

export async function deleteCustomer(id: string): Promise<DeleteResult> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { ok: false, message: SAVE_FAILED };
  await requireUser('/customers');
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .schema('rain_day')
    .from('customers')
    .delete()
    .eq('id', parsedId.data);
  if (error) {
    logger.warn('rain-day: delete customer failed', { code: error.code });
    return { ok: false, message: 'We could not delete that just now. Try again in a minute.' };
  }
  revalidatePath('/customers');
  return { ok: true };
}

export type ImportResult = { ok: true; imported: number } | { ok: false; message: string };

/** Insert the previewed rows. Numbers already in the list are left as they are. */
export async function importCustomers(rows: unknown): Promise<ImportResult> {
  const user = await requireUser('/customers/import');
  const parsed = importRowsSchema.safeParse(rows);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Check the list and try again.',
    };
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .schema('rain_day')
    .from('customers')
    .upsert(
      parsed.data.map((row) => ({ owner_id: user.id, ...row })),
      { onConflict: 'owner_id,phone', ignoreDuplicates: true },
    )
    .select('id');
  if (error) {
    logger.warn('rain-day: import customers failed', {
      code: error.code,
      rows: parsed.data.length,
    });
    return { ok: false, message: 'We could not import the list just now. Try again in a minute.' };
  }
  revalidatePath('/customers');
  return { ok: true, imported: data.length };
}
