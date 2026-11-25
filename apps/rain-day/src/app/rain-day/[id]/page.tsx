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
import { isStale } from '@/lib/clock';

const sentAt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export const metadata: Metadata = { title: 'Rain day sent' };

const LABELS: Record<string, string> = {
  queued: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Did not go through',
  replied: 'Replied',
  skipped: 'Skipped (opted out)',
  skipped_non_us: 'Skipped (not a US number)',
  not_sent: 'Not sent',
};

function statusOf(m: { status: string; error_code: string | null }, stale: boolean): string {
  if (m.status === 'skipped' && m.error_code === 'non_us') return 'skipped_non_us';
  if (m.status === 'queued' && stale) return 'not_sent';
  return m.status;
}

function describeCounts(counts: Record<string, number>): string {
  const parts = [
    counts.texted ? `${counts.texted} texted, each on their own` : null,
    counts.sending ? `${counts.sending} still sending` : null,
    counts.problem ? `${counts.problem} did not go through` : null,
    counts.skipped ? `${counts.skipped} skipped` : null,
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join('. ')}.` : '';
}

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
  const stale = isStale(reschedule.created_at);
  const rows = messages.map((m) => ({ m, status: statusOf(m, stale) }));
  const inFlight = !stale && messages.some((m) => m.status === 'queued' || m.status === 'sent');
  const counts: Record<string, number> = {};
  for (const { status } of rows) {
    const key = ['sent', 'delivered', 'replied'].includes(status)
      ? 'texted'
      : status === 'queued'
        ? 'sending'
        : ['failed', 'not_sent'].includes(status)
          ? 'problem'
          : 'skipped';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return (
    <section className="flex flex-col gap-6 py-4">
      <AutoRefresh active={inFlight} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {weekdayName(weekdayOf(reschedule.from_date))} moved to{' '}
          {weekdayName(weekdayOf(reschedule.to_date))}
        </h1>
        <p className="text-sm text-muted">{describeCounts(counts)}</p>
      </header>
      <ul aria-label="Texts sent" className="flex flex-col gap-2">
        {rows.map(({ m, status }) => (
          <li
            key={m.id}
            data-status={status}
            className="flex flex-col gap-1 rounded-brand border border-border bg-surface px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-base font-medium text-ink">{m.customer_name}</span>
              <span className="text-sm font-medium text-ink">{LABELS[status] ?? status}</span>
            </div>
            {!status.startsWith('skipped') && <p className="text-sm text-muted">{m.body}</p>}
            {m.sent_at && (
              <p className="text-sm text-muted">Sent {sentAt.format(new Date(m.sent_at))}</p>
            )}
          </li>
        ))}
      </ul>
      <ButtonLink href="/rain-day" variant="secondary">
        Back to Rain day
      </ButtonLink>
    </section>
  );
}
