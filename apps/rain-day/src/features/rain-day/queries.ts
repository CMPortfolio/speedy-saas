import type { Db } from '@speedy/db/core';
import type { SchemaTables } from '@speedy/db/types';

import type { Customer } from '@/features/customers/queries';

export type Reschedule = SchemaTables<'rain_day', 'reschedules'>;
export type RescheduleMessage = SchemaTables<'rain_day', 'reschedule_messages'>;

/** The owner's customers whose usual day is `day` (0 = Sunday). RLS limits rows to the owner. */
export async function listCustomersForDay(db: Db, day: number): Promise<Customer[]> {
  const { data, error } = await db
    .schema('rain_day')
    .from('customers')
    .select('*')
    .eq('service_day', day)
    .order('name');
  if (error) throw error;
  return data;
}

export async function getReschedule(db: Db, id: string): Promise<Reschedule | null> {
  const { data, error } = await db
    .schema('rain_day')
    .from('reschedules')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listRescheduleMessages(
  db: Db,
  rescheduleId: string,
): Promise<RescheduleMessage[]> {
  const { data, error } = await db
    .schema('rain_day')
    .from('reschedule_messages')
    .select('*')
    .eq('reschedule_id', rescheduleId)
    .order('customer_name');
  if (error) throw error;
  return data;
}
