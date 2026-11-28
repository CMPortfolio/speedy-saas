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

export interface RescheduleSummary {
  reschedule: Reschedule;
  counts: Record<string, number>;
}

/** The owner's latest rain days with how many texts are in each status. RLS limits rows. */
export async function listRescheduleSummaries(db: Db, limit = 20): Promise<RescheduleSummary[]> {
  const { data: reschedules, error } = await db
    .schema('rain_day')
    .from('reschedules')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (reschedules.length === 0) return [];
  const { data: messages, error: messagesError } = await db
    .schema('rain_day')
    .from('reschedule_messages')
    .select('reschedule_id, status')
    .in(
      'reschedule_id',
      reschedules.map((r) => r.id),
    );
  if (messagesError) throw messagesError;
  return reschedules.map((reschedule) => {
    const counts: Record<string, number> = {};
    for (const m of messages) {
      if (m.reschedule_id === reschedule.id) counts[m.status] = (counts[m.status] ?? 0) + 1;
    }
    return { reschedule, counts };
  });
}

/** Phones this owner's customers texted STOP from. RLS limits rows to the owner. */
export async function listOptedOutPhones(db: Db): Promise<Set<string>> {
  const { data, error } = await db.schema('rain_day').from('opt_outs').select('phone');
  if (error) throw error;
  return new Set(data.map((r) => r.phone));
}

/** Customers who already got a text from this owner. RLS limits rows to the owner. */
export async function listContactedCustomerIds(db: Db): Promise<Set<string>> {
  const { data, error } = await db.schema('rain_day').rpc('contacted_customers');
  if (error) throw error;
  return new Set(data);
}
