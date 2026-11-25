import { formatUsPhone } from '@speedy/lib/phone';

import type { SkipReason } from './plan';
import { renderMessage } from './template';

export interface FormCustomer {
  id: string;
  name: string;
  phone: string;
  /** Set when this customer will be skipped and cannot be ticked. */
  skip: SkipReason | null;
}

export interface CustomerRowProps {
  customer: FormCustomer;
  ticked: boolean;
  newDay: string;
  template: string;
  onToggle: (id: string) => void;
}

const SKIP_NOTES: Record<SkipReason, string> = {
  opted_out: 'Asked not to get texts. Skipped, nothing is sent.',
  non_us: 'Not a US number. Skipped, nothing is sent.',
};

/**
 * One customer: a tick box, who they are, and the text they would get. The whole row is the
 * label, so tapping anywhere on it toggles the box. First-time customers also get the opt-out
 * line added when it is sent; the preview does not show it.
 */
export function CustomerRow({ customer: c, ticked, newDay, template, onToggle }: CustomerRowProps) {
  return (
    <li>
      <label
        htmlFor={`c-${c.id}`}
        className="flex min-h-tap gap-3 rounded-brand border border-border bg-surface px-4 py-3"
      >
        <input
          id={`c-${c.id}`}
          type="checkbox"
          className="mt-1 size-6 shrink-0 accent-primary"
          checked={ticked}
          disabled={c.skip !== null}
          onChange={() => onToggle(c.id)}
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-base font-medium text-ink">
            {c.name}{' '}
            <span className="text-sm font-normal text-muted">{formatUsPhone(c.phone)}</span>
          </span>
          {c.skip ? (
            <span className="text-sm text-muted">{SKIP_NOTES[c.skip]}</span>
          ) : (
            <span className={ticked ? 'text-sm text-muted' : 'text-sm text-muted line-through'}>
              {renderMessage(template, { name: c.name, newDay })}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}
