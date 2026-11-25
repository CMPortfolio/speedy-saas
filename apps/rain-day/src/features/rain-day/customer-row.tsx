import { formatUsPhone } from '@speedy/lib/phone';

import { renderMessage } from './template';

export interface FormCustomer {
  id: string;
  name: string;
  phone: string;
  opted_out: boolean;
}

export interface CustomerRowProps {
  customer: FormCustomer;
  ticked: boolean;
  newDay: string;
  template: string;
  onToggle: (id: string) => void;
}

/** One customer: a tick box, who they are, and the exact text they would get. */
export function CustomerRow({ customer: c, ticked, newDay, template, onToggle }: CustomerRowProps) {
  return (
    <li className="flex gap-3 rounded-brand border border-border bg-surface px-4 py-3">
      <input
        id={`c-${c.id}`}
        type="checkbox"
        className="mt-1 size-6 shrink-0 accent-primary"
        checked={ticked}
        disabled={c.opted_out}
        onChange={() => onToggle(c.id)}
      />
      <label htmlFor={`c-${c.id}`} className="flex min-w-0 flex-col gap-1">
        <span className="text-base font-medium text-ink">
          {c.name} <span className="text-sm font-normal text-muted">{formatUsPhone(c.phone)}</span>
        </span>
        {c.opted_out ? (
          <span className="text-sm text-muted">
            Asked not to get texts. Skipped, nothing is sent.
          </span>
        ) : (
          <span className={ticked ? 'text-sm text-muted' : 'text-sm text-muted line-through'}>
            {renderMessage(template, { name: c.name, newDay })}
          </span>
        )}
      </label>
    </li>
  );
}
