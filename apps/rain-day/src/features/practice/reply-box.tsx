'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@speedy/ui/button';

import { sendPracticeReply } from './actions';

/** Type a reply as the customer, or tap STOP, START or HELP. The server decides what happens. */
export function ReplyBox({
  rescheduleId,
  customerId,
  firstName,
}: {
  rescheduleId: string;
  customerId: string;
  firstName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  function send(text: string) {
    setError(null);
    start(async () => {
      const result = await sendPracticeReply({ rescheduleId, customerId, body: text });
      if (result.ok) {
        setBody('');
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`reply-${customerId}`} className="text-sm font-medium text-ink">
        Reply as {firstName}
      </label>
      <textarea
        id={`reply-${customerId}`}
        rows={2}
        maxLength={1600}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="min-h-tap w-full rounded-brand border border-border bg-surface px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
      <div className="flex flex-wrap gap-2">
        <Button loading={pending} disabled={body.trim() === ''} onClick={() => send(body)}>
          Send reply
        </Button>
        {['STOP', 'START', 'HELP'].map((word) => (
          <Button key={word} variant="secondary" disabled={pending} onClick={() => send(word)}>
            {word}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
