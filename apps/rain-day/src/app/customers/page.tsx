import type { Metadata } from 'next';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';

import { ButtonLink } from '@/components/button-link';
import { CustomersView } from '@/features/customers/customers-view';
import { listCustomers } from '@/features/customers/queries';

export const metadata: Metadata = { title: 'Customers' };

export default async function CustomersPage() {
  await requireUser('/customers');
  const supabase = await createServerSupabase();
  const customers = await listCustomers(supabase);

  return (
    <section className="flex flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Your customers</h1>
        <p className="text-sm text-muted">
          {customers.length === 0
            ? 'Each customer gets their own text when their day is rained out.'
            : `${customers.length} ${customers.length === 1 ? 'customer' : 'customers'}, each with their usual day.`}
        </p>
      </header>
      <div className="grid gap-2 sm:grid-cols-2">
        <ButtonLink href="/rain-day" className="sm:col-span-2">
          Rain day
        </ButtonLink>
        <ButtonLink href="/customers/new" variant="secondary">
          Add a customer
        </ButtonLink>
        <ButtonLink href="/customers/import" variant="secondary">
          Paste or import a list
        </ButtonLink>
      </div>
      <CustomersView customers={customers} />
    </section>
  );
}
