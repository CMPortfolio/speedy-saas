import { cn } from '@speedy/ui/cn';
import { EmptyState } from '@speedy/ui/empty-state';

import { setCallStatus } from './actions';
import { smsHref, telHref, type CallRow } from './call-rows';

const tap =
  'inline-flex min-h-tap items-center justify-center rounded-brand border border-border bg-surface ' +
  'px-4 text-base font-medium text-ink hover:bg-background focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-primary';

function StatusButton({ call, status, label }: { call: CallRow; status: string; label: string }) {
  const active = call.status === status;
  return (
    <form action={setCallStatus}>
      <input type="hidden" name="callId" value={call.id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        aria-pressed={active}
        disabled={active}
        className={cn(tap, 'w-full', active && 'bg-primary text-primary-foreground')}
      >
        {label}
      </button>
    </form>
  );
}

export function CallList({ calls }: { calls: CallRow[] }) {
  if (calls.length === 0) {
    return (
      <EmptyState
        title="No missed calls yet"
        description="When you miss a call, the caller gets your text and it shows up here with their reply."
      />
    );
  }
  return (
    <ul className="space-y-4" data-testid="call-list">
      {calls.map((call) => (
        <li
          key={call.id}
          data-testid="call-row"
          data-status={call.status}
          className="space-y-3 rounded-brand border border-border bg-surface p-4"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-lg font-semibold text-ink">{call.caller}</p>
            <span data-testid="call-status" className="text-sm font-medium text-muted">
              {call.statusLabel}
            </span>
          </div>
          <p className="text-sm text-muted">{call.received}</p>
          {call.reply ? (
            <p className="text-base text-ink" data-testid="call-reply">
              {call.reply}
            </p>
          ) : (
            <p className="text-base text-muted">No reply yet</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <a href={telHref(call.callerNumber)} className={tap}>
              Call back
            </a>
            <a href={smsHref(call.callerNumber)} className={tap}>
              Reply
            </a>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatusButton call={call} status="called_back" label="Called back" />
            <StatusButton call={call} status="booked" label="Booked" />
            <StatusButton call={call} status="junk" label="Junk" />
          </div>
        </li>
      ))}
    </ul>
  );
}
