import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';

import { ButtonLink } from '@/components/button-link';
import { AutoRefresh } from '@/features/rain-day/auto-refresh';
import { getReschedule, listRescheduleMessages } from '@/features/rain-day/queries';
import { weekdayName } from '@/lib/weekday';
import { weekdayOf } from '@/lib/dates';

export const metadata: Metadata = { title: 'Rain day sent' };

const LABELS: Record<string, string> = {
  queued: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Did not go through',
  replied: 'Replied',
  skipped: 'Skipped (opted out)',
};

export default async function RescheduleResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser(`/rain-day/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createServerSupabase();
  const reschedule = await getReschedule(supabase, id);
  if (!reschedule) notFound();
  const messages = await listRescheduleMessages(supabase, id);
  const inFlight = messages.some((m) => m.status === 'queued' || m.status === 'sent');
  const texted = messages.filter((m) => m.status !== 'skipped').length;

  return (
    <section className="flex flex-col gap-6 py-4">
      <AutoRefresh active={inFlight} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {weekdayName(weekdayOf(reschedule.from_date))} moved to{' '}
          {weekdayName(weekdayOf(reschedule.to_date))}
        </h1>
        <p className="text-sm text-muted">
          {texted} {texted === 1 ? 'customer was' : 'customers were'} texted, each on their own.
        </p>
      </header>
      <ul aria-label="Texts sent" className="flex flex-col gap-2">
        {messages.map((m) => (
          <li
            key={m.id}
            data-status={m.status}
            className="flex flex-col gap-1 rounded-brand border border-border bg-surface px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-base font-medium text-ink">{m.customer_name}</span>
              <span className="text-sm font-medium text-ink">{LABELS[m.status] ?? m.status}</span>
            </div>
            {m.status !== 'skipped' && <p className="text-sm text-muted">{m.body}</p>}
          </li>
        ))}
      </ul>
      <ButtonLink href="/rain-day" variant="secondary">
        Back to Rain day
      </ButtonLink>
    </section>
  );
}
