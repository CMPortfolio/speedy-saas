import { countSegments } from '@speedy/sms/segments';

import { cn } from '@speedy/ui/cn';

import type { PracticeMessageRow } from './practice-store';

interface PhoneProps {
  /** "Caller's phone" or "Your cell". */
  title: string;
  /** Which message directions arrive on this phone (shown on the left); the rest were typed on it. */
  received: PracticeMessageRow['direction'][];
  messages: PracticeMessageRow[];
  empty: string;
  testId: string;
}

/** An on-screen phone: received texts on the left, texts typed on it on the right. Nothing here is sent anywhere. */
export function Phone({ title, received, messages, empty, testId }: PhoneProps) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="mx-auto w-full max-w-xs space-y-2 rounded-[2rem] border-4 border-ink/80 bg-surface p-3"
    >
      <h3 className="text-center text-sm font-semibold text-muted">
        {title} <span className="font-normal">· Practice</span>
      </h3>
      <ol className="min-h-40 space-y-2">
        {messages.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-muted">{empty}</li>
        )}
        {messages.map((m) => {
          const incoming = received.includes(m.direction);
          const parts = incoming ? countSegments(m.body).segments : 0;
          return (
            <li key={m.id} className={cn('flex flex-col', incoming ? 'items-start' : 'items-end')}>
              <p
                data-testid="phone-bubble"
                data-direction={m.direction}
                className={cn(
                  'max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm',
                  incoming ? 'bg-background text-ink' : 'bg-primary text-primary-foreground',
                )}
              >
                {m.body}
              </p>
              {parts > 1 && <span className="px-1 text-xs text-muted">{parts} messages</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
