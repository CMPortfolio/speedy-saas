import Link from 'next/link';

import { Card } from '@speedy/ui/card';

import { PracticeBadge } from './practice-badge';
import type { PracticeMessage } from './queries';

const when = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Replies typed on the practice phone, kept apart from real replies and badged Practice. */
export function PracticeRepliesSection({ replies }: { replies: PracticeMessage[] }) {
  return (
    <section aria-label="Practice replies" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        Practice replies <PracticeBadge />
      </h2>
      {replies.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing yet. Reply as a customer on the{' '}
          <Link href="/rain-day/practice" className="font-medium text-primary underline">
            practice phone
          </Link>{' '}
          and it shows up here.
        </p>
      ) : (
        <ul aria-label="Practice replies list" className="flex flex-col gap-2">
          {replies.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-1 border-dashed p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-base font-medium text-ink">
                    {r.customers?.name ?? 'A customer'}
                  </span>
                  <span className="text-sm text-muted">{when.format(new Date(r.created_at))}</span>
                </div>
                <p className="text-base text-ink">{r.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
