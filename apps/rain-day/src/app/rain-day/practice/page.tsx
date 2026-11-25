import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { EmptyState } from '@speedy/ui/empty-state';

import { ButtonLink } from '@/components/button-link';
import { ClearPracticeButton } from '@/features/practice/clear-practice-button';
import { ownerIsInPractice } from '@/features/practice/mode';
import { PracticeBanner } from '@/features/practice/practice-banner';
import type { Bubble, Thread } from '@/features/practice/phone-types';
import { PracticePhone } from '@/features/practice/practice-phone';
import {
  listPracticeMessages,
  listPracticeReschedules,
  type PracticeMessage,
} from '@/features/practice/queries';
import { nowMs } from '@/lib/clock';

export const metadata: Metadata = { title: 'Practice phone' };

const day = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const dayOf = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));

const toBubble = (m: PracticeMessage): Bubble => ({
  id: m.id,
  direction: m.direction as Bubble['direction'],
  kind: m.kind,
  body: m.body,
  status: m.status,
  created_at: m.created_at,
});

/** Group the bubbles by customer, in the order each customer first appears. */
function threadsOf(messages: PracticeMessage[]): Thread[] {
  const threads = new Map<string, Thread>();
  for (const m of messages) {
    if (m.direction === 'forward') continue;
    const key = m.customer_id ?? m.customer_name;
    const thread = threads.get(key) ?? {
      customerId: m.customer_id ?? '',
      name: m.customer_name,
      bubbles: [],
    };
    thread.bubbles.push(toBubble(m));
    threads.set(key, thread);
  }
  return [...threads.values()].filter((t) => t.customerId !== '');
}

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  await requireUser('/rain-day/practice');
  // Practice is only for an owner whose texting number is not set up: anyone else goes back.
  if (!(await ownerIsInPractice())) redirect('/rain-day');
  const params = await searchParams;
  const db = await createServerSupabase();
  const days = await listPracticeReschedules(db);
  const wanted = z.uuid().safeParse(params.day);
  const selected = (wanted.success && days.find((d) => d.id === wanted.data)) || days[0];
  const messages = selected ? await listPracticeMessages(db, selected.id) : [];

  return (
    <section className="flex flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Practice phone</h1>
        <p className="text-sm text-muted">
          See what each customer would get, and answer as them to see what you would get.
        </p>
      </header>
      <PracticeBanner />
      {!selected ? (
        <EmptyState
          title="Nothing sent to the practice phone yet"
          description="Pick the day that is off on Rain day and tap Send as practice."
          action={<ButtonLink href="/rain-day">Go to Rain day</ButtonLink>}
        />
      ) : (
        <>
          <h2 className="text-lg font-semibold">
            Practice: {dayOf(selected.from_date)} moved to {dayOf(selected.to_date)}
          </h2>
          <PracticePhone
            key={selected.id}
            rescheduleId={selected.id}
            threads={threadsOf(messages)}
            cell={messages.filter((m) => m.direction === 'forward').map(toBubble)}
            serverNow={nowMs()}
          />
          {days.length > 1 && (
            <nav aria-label="Practice rain days" className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-ink">Other practice rain days</h2>
              <ul className="flex flex-col gap-2">
                {days
                  .filter((d) => d.id !== selected.id)
                  .map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/rain-day/practice?day=${d.id}`}
                        className="flex min-h-tap items-center rounded-brand border border-border bg-surface px-4 py-2 text-ink"
                      >
                        {dayOf(d.from_date)} moved to {dayOf(d.to_date)}
                      </Link>
                    </li>
                  ))}
              </ul>
            </nav>
          )}
          <ClearPracticeButton />
        </>
      )}
    </section>
  );
}
