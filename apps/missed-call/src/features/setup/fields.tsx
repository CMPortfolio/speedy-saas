'use client';

import { Input } from '@speedy/ui/input';

import { MAX_TEMPLATE, type SetupField } from './schema';

const area =
  'min-h-[7rem] w-full rounded-brand border border-border bg-surface px-3 py-2 text-base text-ink ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

interface TextAreaProps {
  id: SetupField;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
}

/** A text box with a character count and its error, for the two texts callers get. */
export function TextArea({ id, label, value, onChange, error }: TextAreaProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        className={area}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
      />
      <p className="text-sm text-muted">
        {value.length} of {MAX_TEMPLATE} characters
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export interface HoursValue {
  mode: 'always' | 'set';
  opens: string;
  closes: string;
}

interface HoursFieldsProps {
  value: HoursValue;
  onChange: (value: HoursValue) => void;
  error: string | undefined;
  /** Rendered under the times when hours are set: the text for when the owner is closed. */
  children: React.ReactNode;
}

/** "Same text any time" or "Different text when I'm closed" with the open and close times. */
export function HoursFields({ value, onChange, error, children }: HoursFieldsProps) {
  const radio = (mode: HoursValue['mode'], label: string) => (
    <label className="flex min-h-tap items-center gap-3">
      <input
        type="radio"
        name="hours"
        value={mode}
        checked={value.mode === mode}
        onChange={() => onChange({ ...value, mode })}
      />
      <span>{label}</span>
    </label>
  );
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-ink">Your hours</legend>
      {radio('always', 'Same text any time')}
      {radio('set', "Different text when I'm closed")}
      {value.mode === 'set' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Open at"
              name="opens"
              type="time"
              value={value.opens}
              onChange={(e) => onChange({ ...value, opens: e.target.value })}
              required
            />
            <Input
              label="Close at"
              name="closes"
              type="time"
              value={value.closes}
              onChange={(e) => onChange({ ...value, closes: e.target.value })}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {children}
        </div>
      )}
      <p className="text-sm text-muted">Times are Eastern.</p>
    </fieldset>
  );
}
