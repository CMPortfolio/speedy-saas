import type { ReactNode } from 'react';

import { Button } from './button';
import { cn } from './cn';

export interface CustomerColumns<T> {
  name: (item: T) => ReactNode;
  phone: (item: T) => ReactNode;
  day: (item: T) => ReactNode;
  note?: (item: T) => ReactNode;
}

export interface CustomerListProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  /** How each column reads from an item. The app formats phones and days before passing them. */
  columns: CustomerColumns<T>;
  /** Plain-text name for the Edit/Delete button labels ("Edit Maria Lopez"). */
  getLabel?: (item: T) => string;
  /** Pass these from a client component; without them the row shows no actions. */
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  /** Key of the item whose delete is in flight: its buttons show busy. */
  busyKey?: string | null;
  /** Shown instead of the list when there are no items. Usually an `<EmptyState>`. */
  emptyState: ReactNode;
  className?: string;
}

/**
 * A customer list as phone-width cards: name and day on the first line, phone and note under
 * it, Edit and Delete as 44px buttons. Generic over the row type so any tool can use it.
 */
export function CustomerList<T>({
  items,
  getKey,
  columns,
  getLabel,
  onEdit,
  onDelete,
  busyKey = null,
  emptyState,
  className,
}: CustomerListProps<T>) {
  if (items.length === 0) return <>{emptyState}</>;

  return (
    <ul aria-label="Customers" className={cn('flex flex-col gap-3', className)}>
      {items.map((item) => {
        const key = getKey(item);
        const label = getLabel?.(item);
        const note = columns.note?.(item);
        const busy = busyKey === key;
        return (
          <li
            key={key}
            className="flex flex-col gap-2 rounded-brand border border-border bg-surface px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-base font-medium text-ink">{columns.name(item)}</span>
              <span className="shrink-0 rounded-brand bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                {columns.day(item)}
              </span>
            </div>
            <div className="text-sm text-ink">{columns.phone(item)}</div>
            {note ? <div className="text-sm text-muted">{note}</div> : null}
            {(onEdit || onDelete) && (
              <div className="flex gap-2 pt-1">
                {onEdit && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => onEdit(item)}
                    aria-label={label ? `Edit ${label}` : undefined}
                  >
                    Edit
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={busy}
                    onClick={() => onDelete(item)}
                    aria-label={label ? `Delete ${label}` : undefined}
                    className="text-danger hover:bg-danger/10"
                  >
                    Delete
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
