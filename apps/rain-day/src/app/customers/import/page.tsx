import type { Metadata } from 'next';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';

import { ImportCustomers } from '@/features/customers/import-customers';
import { listCustomers } from '@/features/customers/queries';

export const metadata: Metadata = { title: 'Import customers' };

export default async function ImportCustomersPage() {
  await requireUser('/customers/import');
  const supabase = await createServerSupabase();
  const existing = await listCustomers(supabase);

  return (
    <section className="flex flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Paste or import a list</h1>
        <p className="text-sm text-muted">
          Paste from Notes or a spreadsheet, or choose a CSV. You see what will be added before
          anything is saved.
        </p>
      </header>
      <ImportCustomers existingPhones={existing.map((c) => c.phone)} />
    </section>
  );
}
