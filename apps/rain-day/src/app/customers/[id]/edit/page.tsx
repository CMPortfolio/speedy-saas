import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';

import { updateCustomer } from '@/features/customers/actions';
import { CustomerForm } from '@/features/customers/customer-form';
import { getCustomer } from '@/features/customers/queries';

export const metadata: Metadata = { title: 'Edit customer' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/customers/${id}/edit`);
  if (!UUID.test(id)) notFound();
  const supabase = await createServerSupabase();
  const customer = await getCustomer(supabase, id);
  if (!customer) notFound();

  return (
    <section className="flex flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Edit {customer.name}</h1>
        <p className="text-sm text-muted">Changes apply to their next rain-day text.</p>
      </header>
      <CustomerForm action={updateCustomer} customer={customer} submitLabel="Save changes" />
    </section>
  );
}
