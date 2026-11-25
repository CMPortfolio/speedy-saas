import { EmptyState } from '@speedy/ui/empty-state';

import type { CallRow } from './call-rows';
import { RowActions } from './row-actions';

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
          <RowActions call={call} />
        </li>
      ))}
    </ul>
  );
}
