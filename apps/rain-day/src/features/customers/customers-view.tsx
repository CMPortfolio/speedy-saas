'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatUsPhone } from '@speedy/lib/phone';
import { Button } from '@speedy/ui/button';
import { CustomerList } from '@speedy/ui/customer-list';
import { EmptyState } from '@speedy/ui/empty-state';
import { Modal } from '@speedy/ui/modal';

import { ButtonLink } from '@/components/button-link';
import { weekdayName } from '@/lib/weekday';

import { deleteCustomer } from './actions';
import type { Customer } from './queries';

const columns = {
  name: (c: Customer) => c.name,
  phone: (c: Customer) => formatUsPhone(c.phone),
  day: (c: Customer) => weekdayName(c.service_day),
  note: (c: Customer) => c.note,
};

export function CustomersView({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    setBusyKey(target.id);
    setError(null);
    const result = await deleteCustomer(target.id);
    if (!result.ok) setError(result.message);
    setBusyKey(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <CustomerList
        items={customers}
        getKey={(c) => c.id}
        getLabel={(c) => c.name}
        columns={columns}
        onEdit={(c) => router.push(`/customers/${c.id}/edit`)}
        onDelete={setToDelete}
        busyKey={busyKey}
        emptyState={
          <EmptyState
            title="No customers yet"
            description="Add them one at a time, or paste your whole list with each customer's usual day."
            action={<ButtonLink href="/customers/import">Paste or import a list</ButtonLink>}
          />
        }
      />
      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={toDelete ? `Remove ${toDelete.name}?` : 'Remove customer?'}
        description="They will not get rain-day texts from you any more. You can add them back later."
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              Keep
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()}>
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}
