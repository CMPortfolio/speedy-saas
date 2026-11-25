'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@speedy/ui/button';
import { EmptyState } from '@speedy/ui/empty-state';

import { ButtonLink } from '@/components/button-link';
import { addDays, describeNewDay } from '@/lib/dates';
import { weekdayName } from '@/lib/weekday';

import { ConfirmSendModal, texts } from './confirm-send-modal';
import { PracticeBanner } from '@/features/practice/practice-banner';

import { DatePickers } from './date-pickers';
import { CustomerRow, type FormCustomer } from './customer-row';
import { MessageField } from './message-field';
import { submitRainDay } from './submit';

export interface RainDayFormProps {
  from: string;
  to: string;
  today: string;
  /** Weekday number of `from`, so the list heading can say "Tuesday customers". */
  day: number;
  customers: FormCustomer[];
  initialTemplate: string;
  businessName: string;
  /** False until an admin has given this owner a texting number: Send stays off. */
  senderReady: boolean;
}

export function RainDayForm({
  from,
  to,
  today,
  day,
  customers,
  initialTemplate,
  businessName,
  senderReady,
}: RainDayFormProps) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [sending, startSending] = useTransition();
  // Made once when the form opens; every tap on Send carries it, so a retry cannot text twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [template, setTemplate] = useState(initialTemplate);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newDay = describeNewDay(to, today);
  const sendable = customers.filter((c) => !c.skip && !unticked.has(c.id));
  const skipped = customers.filter((c) => c.skip).length;
  const dateError =
    from === to ? 'Pick a different day.' : to < today ? 'Pick today or later.' : undefined;
  // No real texting number yet: practice mode. The server decides this again for every send.
  const practice = !senderReady;
  const canSend = sendable.length > 0 && template.trim() !== '' && !dateError;

  function go(nextFrom: string, nextTo: string) {
    startNavigation(() => router.replace(`/rain-day?from=${nextFrom}&to=${nextTo}`));
  }

  function toggle(id: string) {
    setUnticked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function send() {
    setError(null);
    startSending(async () => {
      const result = await submitRainDay(practice, {
        idempotencyKey,
        from,
        to,
        template,
        // Skipped customers go along so the send records them as skipped.
        customerIds: customers.filter((c) => c.skip || !unticked.has(c.id)).map((c) => c.id),
      });
      setConfirming(false);
      if (result.href) router.push(result.href);
      else setError(result.error ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {practice && <PracticeBanner />}
      <DatePickers
        from={from}
        to={to}
        today={today}
        error={dateError}
        onFrom={(value) =>
          // Keep "the day after" as the new day unless the owner picked something else.
          go(value, to === addDays(from, 1) ? addDays(value, 1) : to)
        }
        onTo={(value) => go(from, value)}
      />

      {customers.length === 0 ? (
        <EmptyState
          title={`Nobody is on ${weekdayName(day)}`}
          description="Customers show up here when their usual day matches the day that's off."
          action={<ButtonLink href="/customers">Check your customers</ButtonLink>}
        />
      ) : (
        <>
          <section aria-busy={navigating} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              {weekdayName(day)} customers ({sendable.length} of {customers.length} will get a text)
            </h2>
            <ul aria-label="Customers to text" className="flex flex-col gap-2">
              {customers.map((c) => (
                <CustomerRow
                  key={c.id}
                  customer={c}
                  ticked={!c.skip && !unticked.has(c.id)}
                  newDay={newDay}
                  template={template}
                  businessName={businessName}
                  onToggle={toggle}
                />
              ))}
            </ul>
          </section>
          <MessageField value={template} onChange={setTemplate} />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button size="lg" fullWidth disabled={!canSend} onClick={() => setConfirming(true)}>
            {practice
              ? `Send as practice (${texts(sendable.length)})`
              : `Send ${texts(sendable.length)}`}
          </Button>
        </>
      )}

      <ConfirmSendModal
        open={confirming}
        sending={sending}
        count={sendable.length}
        skipped={skipped}
        newDay={newDay}
        practice={practice}
        onCancel={() => setConfirming(false)}
        onConfirm={send}
      />
    </div>
  );
}
