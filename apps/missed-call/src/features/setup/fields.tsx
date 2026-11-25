'use client';

import { Input } from '@speedy/ui/input';

import { MAX_TEMPLATE, type SetupField } from './schema';

const area =
  'min-h-[7rem] w-full rounded-brand border bg-surface px-3 py-2 text-base text-ink ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** The error under a field. Linked to the field with aria-describedby; the summary above the form is the one alert. */
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} className="text-sm text-danger">
      {message}
    </p>
  );
}

interface TextFieldProps {
  id: SetupField;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
  type?: 'text' | 'tel';
  autoComplete?: string;
}

/** A labeled one-line field whose error is linked to it and marks it invalid. */
export function TextField({ id, label, hint, error, onChange, ...rest }: TextFieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="space-y-1">
      <Input
        id={id}
        name={id}
        label={label}
        hint={hint}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        inputMode={rest.type === 'tel' ? 'tel' : undefined}
        required
        {...rest}
      />
      <FieldError id={id} message={error} />
    </div>
  );
}

interface TextAreaProps {
  id: SetupField;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
}

/** A text box with a character count, a hard limit and its error, for the two texts callers get. */
export function TextArea({ id, label, value, onChange, error }: TextAreaProps) {
  const describedBy = [`${id}-count`, error ? `${id}-error` : null].filter(Boolean).join(' ');
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        className={`${area} ${error ? 'border-danger' : 'border-field'}`}
        value={value}
        maxLength={MAX_TEMPLATE}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <p id={`${id}-count`} className="text-sm text-muted">
        {value.length} of {MAX_TEMPLATE} characters
      </p>
      <FieldError id={id} message={error} />
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
  const link = error ? { 'aria-invalid': true, 'aria-describedby': 'hours-error' } : {};
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-ink">Your hours</legend>
      {radio('always', 'Same text any time')}
      {radio('set', "Different text when I'm closed")}
      {value.mode === 'set' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="hours"
              label="Open at"
              name="opens"
              type="time"
              value={value.opens}
              onChange={(e) => onChange({ ...value, opens: e.target.value })}
              required
              {...link}
            />
            <Input
              label="Close at"
              name="closes"
              type="time"
              value={value.closes}
              onChange={(e) => onChange({ ...value, closes: e.target.value })}
              required
              {...link}
            />
          </div>
          <FieldError id="hours" message={error} />
          {children}
        </div>
      )}
      <p className="text-sm text-muted">Times are Eastern.</p>
    </fieldset>
  );
}
