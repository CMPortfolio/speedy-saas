'use client';

import { useActionState } from 'react';

import { formatUsPhone } from '@speedy/lib/phone';
import { Button } from '@speedy/ui/button';
import { Input } from '@speedy/ui/input';

import { IDLE } from '@/lib/form-state';

import { saveSettings } from './actions';

export interface SettingsFormProps {
  businessName: string;
  phone: string;
}

export function SettingsForm({ businessName, phone }: SettingsFormProps) {
  const [state, action, pending] = useActionState(saveSettings, IDLE);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Input
        label="Business name"
        name="business_name"
        defaultValue={businessName}
        autoComplete="organization"
        required
        hint="Customers see this at the top of every text, so they know who it's from."
        error={errors.business_name}
      />
      <Input
        label="Your cell"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={phone ? formatUsPhone(phone) : ''}
        placeholder="(239) 555-0123"
        required
        hint="The number customers can call or text back about the new day."
        error={errors.phone}
      />
      {state.status === 'error' && !state.fieldErrors && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.status === 'saved' && (
        <p role="status" className="text-sm text-success">
          Saved.
        </p>
      )}
      <Button type="submit" size="lg" fullWidth loading={pending}>
        Save
      </Button>
    </form>
  );
}
