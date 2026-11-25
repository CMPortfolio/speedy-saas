'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@speedy/ui/button';
import { EmptyState } from '@speedy/ui/empty-state';
import { Input } from '@speedy/ui/input';

import { ButtonLink } from '@/components/button-link';
import { addDays, describeNewDay } from '@/lib/dates';
import { weekdayName } from '@/lib/weekday';

import { sendRainDay } from './actions';
import { ConfirmSendModal, texts } from './confirm-send-modal';
import { CustomerRow, type FormCustomer } from './customer-row';
import { MessageField } from './message-field';

export interface RainDayFormProps {
  from: string;
  to: string;
  today: string;
  /** Weekday number of `from`, so the list heading can say "Tuesday customers". */
  day: number;
  customers: FormCustomer[];
  initialTemplate: string;
}

export function RainDayForm({
  from,
  to,
  today,
  day,
  customers,
  initialTemplate,
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
  const sendable = customers.filter((c) => !c.opted_out && !unticked.has(c.id));
  const skipped = customers.filter((c) => c.opted_out).length;
  const dateError =
    from === to ? 'Pick a different day.' : to < today ? 'Pick today or later.' : undefined;
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
      const result = await sendRainDay({
        idempotencyKey,
        from,
        to,
        template,
        // Opted-out customers go along so the send records them as skipped.
        customerIds: customers.filter((c) => c.opted_out || !unticked.has(c.id)).map((c) => c.id),
      });
      setConfirming(false);
      if (result.ok) router.push(`/rain-day/${result.rescheduleId}`);
      else setError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Day that's off"
          type="date"
          name="from"
          value={from}
          onChange={(e) => {
            // Keep "the day after" as the new day unless the owner picked something else.
            if (e.target.value)
              go(e.target.value, to === addDays(from, 1) ? addDays(e.target.value, 1) : to);
          }}
        />
        <Input
          label="Move them to"
          type="date"
          name="to"
          value={to}
          min={today}
          onChange={(e) => e.target.value && go(from, e.target.value)}
          error={dateError}
        />
      </div>

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
                  ticked={!c.opted_out && !unticked.has(c.id)}
                  newDay={newDay}
                  template={template}
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
            {`Send ${texts(sendable.length)}`}
          </Button>
        </>
      )}

      <ConfirmSendModal
        open={confirming}
        sending={sending}
        count={sendable.length}
        skipped={skipped}
        newDay={newDay}
        onCancel={() => setConfirming(false)}
        onConfirm={send}
      />
    </div>
  );
}
