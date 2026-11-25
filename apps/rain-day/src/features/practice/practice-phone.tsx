'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { firstName } from '@speedy/lib/phone';
import { cn } from '@speedy/ui/cn';
import { Eyebrow } from '@speedy/ui/eyebrow';

import { BubbleView, PhoneFrame } from './phone-frame';
import type { Bubble, Thread } from './phone-types';
import { ReplyBox } from './reply-box';
import { displayStatus, stillMoving } from './status';

export interface PracticePhoneProps {
  rescheduleId: string;
  threads: Thread[];
  /** What the owner's own cell would get: the forwards. */
  cell: Bubble[];
  /** The server's clock when the page was made, so statuses do not depend on this device's clock. */
  serverNow: number;
}

/** The clock the statuses are read against: the server's, ticking forward on this device. */
function useServerClock(serverNow: number, active: boolean): Date {
  const [offset] = useState(() => Date.now() - serverNow);
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date(Date.now() - offset)), 500);
    return () => clearInterval(id);
  }, [active, offset]);
  return now;
}

export function PracticePhone({ rescheduleId, threads, cell, serverNow }: PracticePhoneProps) {
  const router = useRouter();
  const all = threads.flatMap((t) => t.bubbles);
  const moving = stillMoving(
    all.filter((b) => b.direction === 'out' && b.kind === 'text'),
    new Date(serverNow),
  );
  const now = useServerClock(serverNow, true);
  const movingNow = stillMoving(
    all.filter((b) => b.direction === 'out' && b.kind === 'text'),
    now,
  );
  useEffect(() => {
    if (!moving && !movingNow) return;
    const id = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(id);
  }, [moving, movingNow, router]);

  const [selectedId, setSelectedId] = useState(threads[0]?.customerId ?? '');
  const selected = threads.find((t) => t.customerId === selectedId) ?? threads[0];
  if (!selected) return null;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Customers" className="flex flex-col gap-2">
        <Eyebrow>Tap a customer to see their phone</Eyebrow>
        <ul className="flex flex-col gap-2">
          {threads.map((t) => {
            const last = t.bubbles.filter((b) => b.direction === 'out' && b.kind === 'text').at(-1);
            const shown = last ? displayStatus(last.status, last.created_at, now) : null;
            return (
              <li key={t.customerId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(t.customerId)}
                  aria-pressed={t.customerId === selected.customerId}
                  data-status={shown ?? undefined}
                  className={cn(
                    'flex min-h-tap w-full items-center justify-between gap-3 rounded-brand border px-4 py-2 text-left',
                    t.customerId === selected.customerId
                      ? 'border-brand bg-brand-soft'
                      : 'border-line bg-surface',
                  )}
                >
                  <span className="text-base font-medium text-ink">{t.name}</span>
                  <span className="text-sm text-muted">{shown ?? ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <PhoneFrame label={`${selected.name}'s phone`} testId="customer-phone">
        {selected.bubbles.map((b) => (
          <BubbleView key={b.id} bubble={b} now={now} />
        ))}
      </PhoneFrame>
      <ReplyBox
        key={selected.customerId}
        rescheduleId={rescheduleId}
        customerId={selected.customerId}
        firstName={firstName(selected.name) || 'the customer'}
      />
      <PhoneFrame label="Your cell" testId="your-cell">
        {cell.length === 0 ? (
          <p className="text-sm text-muted">
            When a customer replies, the text you would get shows here.
          </p>
        ) : (
          cell.map((b) => <BubbleView key={b.id} bubble={b} now={now} />)
        )}
      </PhoneFrame>
    </div>
  );
}
