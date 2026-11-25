import type { Metadata } from 'next';

import { requireUser } from '@speedy/auth/user';

import { createCustomer } from '@/features/customers/actions';
import { CustomerForm } from '@/features/customers/customer-form';

export const metadata: Metadata = { title: 'Add a customer' };

export default async function NewCustomerPage() {
  await requireUser('/customers/new');
  return (
    <section className="flex flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Add a customer</h1>
        <p className="text-sm text-muted">Name, cell and the day you usually come by.</p>
      </header>
      <CustomerForm action={createCustomer} submitLabel="Add customer" />
    </section>
  );
}
