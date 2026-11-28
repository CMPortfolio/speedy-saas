'use client';

import { useId } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from './cn';

export interface InputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'id'> {
  /** Always rendered and tied to the field. Plain words for the trade, not jargon. */
  label: ReactNode;
  /** Short help under the field, e.g. "We only text about this job." */
  hint?: ReactNode;
  /** Validation message. Marks the field invalid and reads out with the field. */
  error?: ReactNode;
  /** Set your own id if a form needs one; otherwise one is generated. */
  id?: string;
}

/**
 * Labeled text input. The label is always visible and associated by id; hint and error are
 * announced through `aria-describedby`. The field itself is at least 44px tall.
 */
export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-tap w-full rounded-brand border bg-surface px-3 text-base text-ink',
          'placeholder:text-muted',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          'disabled:cursor-not-allowed disabled:opacity-60',
          error ? 'border-danger' : 'border-border',
          className,
        )}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
