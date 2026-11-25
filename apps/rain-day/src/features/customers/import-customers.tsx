'use client';

import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';

import { formatUsPhone, isUsDomesticPhone, normalizeUsPhone } from '@speedy/lib/phone';
import { CsvImport } from '@speedy/ui/csv-import';
import type { AcceptedRow, RowValidators } from '@speedy/ui/csv';

import { ContactsPickerButton, type PickedContact } from '@/components/contacts-picker-button';
import { parseWeekday, SERVICE_DAY_OPTIONS, weekdayName, type ServiceDay } from '@/lib/weekday';

import { importCustomers } from './actions';

type Phone = NonNullable<ReturnType<typeof normalizeUsPhone>>;

function appendLines(text: string, lines: string[]): string {
  const base = text.trimEnd();
  return `${base}${base ? '\n' : ''}${lines.join('\n')}\n`;
}

export function ImportCustomers({ existingPhones }: { existingPhones: string[] }) {
  const router = useRouter();
  const dayId = useId();
  const [text, setText] = useState('');
  const [contactsDay, setContactsDay] = useState<ServiceDay>(1);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validators = useMemo<RowValidators<Phone, ServiceDay>>(
    () => ({
      // US area codes only: Canada and the Caribbean are billed as international.
      phone: (value: string) => (isUsDomesticPhone(value) ? normalizeUsPhone(value) : null),
      day: parseWeekday,
      existingPhones: new Set(existingPhones as Phone[]),
    }),
    [existingPhones],
  );

  function addContacts(contacts: PickedContact[]) {
    const day = weekdayName(contactsDay);
    setText((prev) =>
      appendLines(
        prev,
        contacts.map((c) => `${c.name || 'Customer'}, ${c.tel}, ${day}`),
      ),
    );
  }

  async function handleImport(rows: AcceptedRow<Phone, ServiceDay>[]) {
    setImporting(true);
    setError(null);
    const result = await importCustomers(
      rows.map((r) => ({ name: r.name, phone: r.phone, service_day: r.day, note: r.note })),
    );
    if (result.ok) {
      router.push('/customers');
      return;
    }
    setError(result.message);
    setImporting(false);
  }

  return (
    <CsvImport
      text={text}
      onTextChange={setText}
      validators={validators}
      onImport={handleImport}
      formatPhone={formatUsPhone}
      formatDay={weekdayName}
      importing={importing}
      error={error}
      extraActions={
        <ContactsPickerButton
          onPicked={addContacts}
          aside={
            <div className="flex flex-col gap-1">
              <label htmlFor={dayId} className="text-sm font-medium text-ink">
                Their usual day
              </label>
              <select
                id={dayId}
                value={contactsDay}
                onChange={(e) => setContactsDay(Number(e.target.value) as ServiceDay)}
                className="min-h-tap rounded-brand border border-border bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {SERVICE_DAY_OPTIONS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>
          }
        />
      }
    />
  );
}
