import type { Metadata } from 'next';
import Link from 'next/link';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { EmptyState } from '@speedy/ui/empty-state';

import { ButtonLink } from '@/components/button-link';
import { listRescheduleSummaries } from '@/features/rain-day/queries';
import { isStale } from '@/lib/clock';

export const metadata: Metadata = { title: 'Past rain days' };

const ORDER = ['delivered', 'replied', 'sent', 'queued', 'not_sent', 'failed', 'skipped'] as const;
const WORDS: Record<string, string> = {
  delivered: 'delivered',
  replied: 'replied',
  sent: 'sent',
  queued: 'sending',
  not_sent: 'not sent',
  failed: 'failed',
  skipped: 'skipped',
};

/** Dates are calendar days ('2026-12-01'), so format them in UTC to keep the day. */
const day = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

function dayOf(iso: string): string {
  return day.format(new Date(`${iso}T00:00:00Z`));
}

/** Same rule as the results page: a text still queued after two minutes was not sent. */
function summary(counts: Record<string, number>, stale: boolean): string {
  const shown = stale ? { ...counts, not_sent: counts.queued ?? 0, queued: 0 } : counts;
  return ORDER.filter((k) => shown[k])
    .map((k) => `${shown[k]} ${WORDS[k]}`)
    .join(', ');
}

export default async function HistoryPage() {
  await requireUser('/rain-day/history');
  const supabase = await createServerSupabase();
  const items = await listRescheduleSummaries(supabase);

  return (
    <section className="flex flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Past rain days</h1>
        <p className="text-sm text-muted">
          Tap one to see who got which text, when, and how it went.
        </p>
      </header>
      {items.length === 0 ? (
        <EmptyState
          title="Nothing sent yet"
          description="Your rain days show up here after you send them."
          action={<ButtonLink href="/rain-day">Run a rain day</ButtonLink>}
        />
      ) : (
        <ul aria-label="Past rain days" className="flex flex-col gap-2">
          {items.map(({ reschedule: r, counts }) => (
            <li key={r.id}>
              <Link
                href={`/rain-day/${r.id}`}
                className="flex min-h-tap flex-col gap-1 rounded-brand border border-border bg-surface px-4 py-3 hover:bg-background"
              >
                <span className="text-base font-medium text-ink">
                  {dayOf(r.from_date)} moved to {dayOf(r.to_date)}
                </span>
                <span className="text-sm text-muted">{summary(counts, isStale(r.created_at))}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
