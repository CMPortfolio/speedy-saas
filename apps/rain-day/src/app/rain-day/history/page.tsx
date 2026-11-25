import type { Metadata } from 'next';
import Link from 'next/link';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { EmptyState } from '@speedy/ui/empty-state';

import { ButtonLink } from '@/components/button-link';
import { listRescheduleSummaries } from '@/features/rain-day/queries';
import { weekdayOf } from '@/lib/dates';
import { weekdayName } from '@/lib/weekday';

export const metadata: Metadata = { title: 'Past rain days' };

const ORDER = ['delivered', 'replied', 'sent', 'queued', 'failed', 'skipped'] as const;
const WORDS: Record<string, string> = {
  delivered: 'delivered',
  replied: 'replied',
  sent: 'sent',
  queued: 'sending',
  failed: 'failed',
  skipped: 'skipped',
};

function summary(counts: Record<string, number>): string {
  return ORDER.filter((k) => counts[k])
    .map((k) => `${counts[k]} ${WORDS[k]}`)
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
                  {weekdayName(weekdayOf(r.from_date))} {r.from_date} moved to{' '}
                  {weekdayName(weekdayOf(r.to_date))} {r.to_date}
                </span>
                <span className="text-sm text-muted">{summary(counts)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
