'use client';

import Link from 'next/link';
import { useActionState, useId } from 'react';

import { formatUsPhone } from '@speedy/lib/phone';
import { Button } from '@speedy/ui/button';
import { cn } from '@speedy/ui/cn';
import { Input } from '@speedy/ui/input';

import { IDLE, type FieldErrors } from '@/lib/form-state';
import { SERVICE_DAY_OPTIONS } from '@/lib/weekday';

import type { CustomerFormState } from './actions';
import type { Customer } from './queries';
import type { CustomerField } from './schema';

export interface CustomerFormProps {
  action: (prev: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  /** Set when editing; the id is posted as a hidden field. */
  customer?: Customer;
  submitLabel: string;
}

function DaySelect({ defaultValue, error }: { defaultValue: string; error?: string | undefined }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Usual day
      </label>
      <select
        id={id}
        name="service_day"
        defaultValue={defaultValue}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'min-h-tap w-full rounded-brand border bg-surface px-3 text-base text-ink',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          error ? 'border-danger' : 'border-border',
        )}
      >
        <option value="" disabled>
          Pick a day
        </option>
        {SERVICE_DAY_OPTIONS.map((day) => (
          <option key={day.value} value={day.value}>
            {day.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function FormMessage({ state }: { state: CustomerFormState }) {
  if (state.status !== 'error' || state.fieldErrors) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {state.message}
    </p>
  );
}

const NO_ERRORS: FieldErrors<CustomerField> = {};

export function CustomerForm({ action, customer, submitLabel }: CustomerFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const errors = state.status === 'error' ? (state.fieldErrors ?? NO_ERRORS) : NO_ERRORS;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <Input
        label="Name"
        name="name"
        defaultValue={customer?.name ?? ''}
        autoComplete="off"
        required
        error={errors.name}
      />
      <Input
        label="Cell number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        defaultValue={customer ? formatUsPhone(customer.phone) : ''}
        placeholder="(239) 555-0123"
        required
        hint="The number their rain-day text goes to."
        error={errors.phone}
      />
      <DaySelect
        defaultValue={customer ? String(customer.service_day) : ''}
        error={errors.service_day}
      />
      <Input
        label="Note (optional)"
        name="note"
        defaultValue={customer?.note ?? ''}
        placeholder="Back gate, dog in yard, pool cage"
        error={errors.note}
      />
      <FormMessage state={state} />
      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" fullWidth loading={pending}>
          {submitLabel}
        </Button>
        <Link
          href="/customers"
          className="inline-flex min-h-tap items-center justify-center text-sm font-medium text-muted underline-offset-4 hover:underline"
        >
          Back to the list
        </Link>
      </div>
    </form>
  );
}
