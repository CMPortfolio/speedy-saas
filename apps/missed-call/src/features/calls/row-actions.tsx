'use client';

import { useActionState } from 'react';

import { cn } from '@speedy/ui/cn';

import { setCallStatus } from './actions';
import { smsHref, telHref, type CallRow } from './call-rows';
import { idleMark } from './mark-action';

const tap =
  'inline-flex min-h-tap items-center justify-center rounded-brand border border-border bg-surface ' +
  'px-4 text-base font-medium text-ink hover:bg-background focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-primary';

const STATUS_BUTTONS = [
  { status: 'called_back', label: 'Called back' },
  { status: 'booked', label: 'Booked' },
  { status: 'junk', label: 'Junk' },
] as const;

/** Call back, Reply and the three status buttons for one call, with an inline error if a save fails. */
export function RowActions({ call }: { call: CallRow }) {
  const [state, action, pending] = useActionState(setCallStatus, idleMark);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={telHref(call.callerNumber)}
          className={tap}
          aria-label={`Call back ${call.caller}`}
        >
          Call back
        </a>
        <a href={smsHref(call.callerNumber)} className={tap} aria-label={`Reply to ${call.caller}`}>
          Reply
        </a>
      </div>
      <form action={action} className="grid grid-cols-3 gap-2">
        <input type="hidden" name="callId" value={call.id} />
        {STATUS_BUTTONS.map(({ status, label }) => {
          const active = call.status === status;
          return (
            <button
              key={status}
              type="submit"
              name="status"
              value={status}
              aria-label={`${label}: ${call.caller}`}
              aria-pressed={active}
              aria-disabled={active || pending}
              onClick={(e) => {
                if (active || pending) e.preventDefault();
              }}
              className={cn(tap, active && 'bg-primary text-primary-foreground')}
            >
              {label}
            </button>
          );
        })}
      </form>
      {state.status === 'error' && (
        <p role="alert" data-testid="mark-error" className="text-sm font-medium text-danger">
          {state.message}
        </p>
      )}
    </>
  );
}
