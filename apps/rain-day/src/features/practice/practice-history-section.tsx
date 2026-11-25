import Link from 'next/link';

import { PracticeBadge } from './practice-badge';
import type { PracticeDaySummary } from './queries';

/** Dates are calendar days ('2026-12-01'), so format them in UTC to keep the day. */
const day = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const dayOf = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));

function counts(s: PracticeDaySummary): string {
  const parts = [
    `${s.texted} ${s.texted === 1 ? 'text' : 'texts'} on the practice phone`,
    s.skipped > 0 ? `${s.skipped} skipped` : null,
    s.replies > 0 ? `${s.replies} ${s.replies === 1 ? 'reply' : 'replies'}` : null,
  ].filter(Boolean);
  return parts.join(', ');
}

/** The owner's practice rain days, badged Practice, linking to the practice phone. */
export function PracticeHistorySection({ items }: { items: PracticeDaySummary[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Practice rain days" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        Practice rain days <PracticeBadge />
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((s) => (
          <li key={s.day.id}>
            <Link
              href={`/rain-day/practice?day=${s.day.id}`}
              className="flex min-h-tap flex-col gap-1 rounded-brand border border-dashed border-border bg-surface px-4 py-3 hover:bg-background"
            >
              <span className="flex items-center gap-2 text-base font-medium text-ink">
                {dayOf(s.day.from_date)} moved to {dayOf(s.day.to_date)} <PracticeBadge />
              </span>
              <span className="text-sm text-muted">{counts(s)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
