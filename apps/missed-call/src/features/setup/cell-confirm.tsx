'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';

import { Button } from '@speedy/ui/button';

import { confirmCellCode, sendCellCode } from './cell-actions';
import { RESEND_SECONDS, idleCell, type CellState } from './cell-state';

/** Seconds left before the resend button works again, counting down from the moment a code was sent. */
function useCountdown(since: number | null): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (since === null) return;
    const tick = () =>
      setLeft(Math.max(0, RESEND_SECONDS - Math.floor((Date.now() - since) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return left;
}

type Problem = Extract<CellState, { status: 'error' }>;

/** The error to show: a wrong or expired code wins over a failed send. */
function firstProblem(...states: CellState[]): Problem | null {
  return states.find((s): s is Problem => s.status === 'error') ?? null;
}

/**
 * Confirm the cell: "Send code" texts a 6-digit code, the owner types it back. Until it is
 * confirmed, replies show in the list but are not texted to the owner.
 */
export function CellConfirm({ canSend }: { canSend: boolean }) {
  const [sendState, setSendState] = useState<CellState>(idleCell);
  const [sending, startSend] = useTransition();
  const [confirmState, confirm, confirming] = useActionState(confirmCellCode, idleCell);
  const sentAt = sendState.status === 'sent' ? sendState.sentAt : null;
  const wait = useCountdown(sentAt);
  const codeSent = sentAt !== null;

  const send = () =>
    startSend(async () => {
      setSendState(await sendCellCode());
    });

  const problem = firstProblem(confirmState, sendState);

  return (
    <section className="space-y-3" aria-labelledby="confirm-cell" data-testid="cell-confirm">
      <h2 id="confirm-cell" className="text-lg font-semibold">
        Confirm your cell
      </h2>
      <p className="text-muted">
        We text a 6-digit code to the cell number above. Until you confirm it, replies show in your
        list but are not texted to you.
      </p>

      {!codeSent && (
        <Button
          type="button"
          onClick={send}
          loading={sending}
          disabled={!canSend}
          data-testid="send-code"
        >
          Send code
        </Button>
      )}
      {!canSend && (
        <p className="text-sm text-muted">
          Your missed-call number isn&apos;t ready yet, so we can&apos;t text a code. It shows up on
          this page when it is.
        </p>
      )}

      {codeSent && sendState.status === 'sent' && (
        <p role="status" data-testid="code-sent">
          {sendState.message}
        </p>
      )}

      {codeSent && (
        <form action={confirm} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="cell-code" className="text-sm font-medium text-ink">
              6-digit code
            </label>
            <input
              id="cell-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? 'cell-code-error' : undefined}
              className="min-h-tap w-full rounded-brand border border-border bg-surface px-3 text-lg tracking-widest text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button type="submit" loading={confirming} data-testid="confirm-code">
              Confirm
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={send}
              loading={sending}
              disabled={wait > 0}
              data-testid="resend-code"
            >
              {wait > 0 ? `Resend in ${wait}s` : 'Send a new code'}
            </Button>
          </div>
        </form>
      )}

      {problem && (
        <p
          id="cell-code-error"
          role="alert"
          data-testid="cell-error"
          data-code={problem.code}
          className="text-sm font-medium text-danger"
        >
          {problem.message}
        </p>
      )}
    </section>
  );
}
