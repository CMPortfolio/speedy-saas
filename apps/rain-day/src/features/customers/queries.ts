import type { Db } from '@speedy/db/core';
import type { Tables } from '@speedy/db/types';

export type Customer = Tables<{ schema: 'rain_day' }, 'customers'>;

/** The signed-in owner's customers, by day then name. RLS limits rows to the owner. */
export async function listCustomers(db: Db): Promise<Customer[]> {
  const { data, error } = await db
    .schema('rain_day')
    .from('customers')
    .select('*')
    .order('service_day')
    .order('name');
  if (error) throw error;
  return data;
}

export async function getCustomer(db: Db, id: string): Promise<Customer | null> {
  const { data, error } = await db
    .schema('rain_day')
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
