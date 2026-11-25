import type { ReactNode } from 'react';

import { cn } from '@speedy/ui/cn';

import { PracticeBadge } from './practice-badge';
import { displayStatus, type PracticeStatus } from './status';
import type { Bubble } from './phone-types';

const STATUS_WORDS: Record<PracticeStatus, string> = {
  queued: 'Queued',
  sent: 'Sent',
  delivered: 'Delivered',
  skipped: 'Skipped (opted out)',
  replied: 'Delivered, replied',
  received: '',
};

/** A phone-shaped box with a label above it, so each view says whose phone it is. */
export function PhoneFrame({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section aria-label={label} data-testid={testId} className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        {label} <PracticeBadge />
      </h3>
      <div className="flex min-h-48 flex-col gap-2 rounded-brand border-2 border-border bg-background p-3">
        {children}
      </div>
    </section>
  );
}

/** One chat bubble. Texts from the business sit left; what the owner typed as the customer sits right. */
export function BubbleView({ bubble, now }: { bubble: Bubble; now: Date }) {
  const mine = bubble.direction === 'in';
  const note = bubble.kind === 'note';
  const status =
    bubble.direction === 'out' && !note
      ? displayStatus(bubble.status, bubble.created_at, now)
      : null;
  return (
    <div className={cn('flex flex-col gap-0.5', mine ? 'items-end' : 'items-start')}>
      <p
        data-status={status ?? undefined}
        className={cn(
          'max-w-[85%] rounded-brand px-3 py-2 text-sm',
          mine && 'bg-primary text-primary-foreground',
          !mine && !note && 'border border-border bg-surface text-ink',
          note && 'text-xs italic text-muted',
        )}
      >
        {bubble.body}
      </p>
      {status && STATUS_WORDS[status] && (
        <span className="text-xs text-muted">{STATUS_WORDS[status]}</span>
      )}
    </div>
  );
}
