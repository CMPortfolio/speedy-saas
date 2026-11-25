'use client';

import { useActionState, useState } from 'react';

import { formatUsPhone } from '@speedy/lib/phone';
import { Button } from '@speedy/ui/button';
import { Input } from '@speedy/ui/input';

import { saveSetup } from './actions';
import { HoursFields, TextArea, type HoursValue } from './fields';
import { DEFAULT_OPEN_HOURS } from './hours';
import type { MyLine } from './line-queries';
import { Preview } from './preview';
import { idleSetup } from './save-setup';
import { defaultAfterHoursTemplate, defaultTemplate } from './schema';

function initialValues(line: MyLine | null) {
  return {
    businessName: line?.businessName ?? '',
    ownerCell: line ? formatUsPhone(line.ownerCell) : '',
    template: line?.template ?? '',
    afterHours: line?.afterHoursTemplate ?? '',
    hours: (line?.quietHours
      ? { mode: 'set', opens: line.quietHours.end, closes: line.quietHours.start }
      : { mode: 'always', ...DEFAULT_OPEN_HOURS }) as HoursValue,
  };
}

/** Business name, cell, the text callers get (with a live preview), after-hours text and hours. */
export function SetupForm({ line }: { line: MyLine | null }) {
  const [state, action, pending] = useActionState(saveSetup, idleSetup);
  const errors = state.status === 'invalid' ? state.errors : {};

  const [initial] = useState(() => initialValues(line));
  const [businessName, setBusinessName] = useState(initial.businessName);
  const [ownerCell, setOwnerCell] = useState(initial.ownerCell);
  const [template, setTemplate] = useState(initial.template);
  const [afterHours, setAfterHours] = useState(initial.afterHours);
  const [hours, setHours] = useState(initial.hours);

  // Until the owner writes their own, the texts follow the business name.
  const shownTemplate = template || defaultTemplate(businessName);
  const shownAfterHours = afterHours || defaultAfterHoursTemplate(businessName);

  return (
    <form action={action} className="space-y-6" data-testid="setup-form">
      <Input
        label="Business name"
        name="businessName"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        autoComplete="organization"
        error={errors.businessName}
        required
      />
      <Input
        label="Your cell number"
        name="ownerCell"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={ownerCell}
        onChange={(e) => setOwnerCell(e.target.value)}
        hint="Where leads get texted to you."
        error={errors.ownerCell}
        required
      />
      <TextArea
        id="template"
        label="Text callers get when you miss them"
        value={shownTemplate}
        onChange={setTemplate}
        error={errors.template}
      />
      <HoursFields value={hours} onChange={setHours} error={errors.hours}>
        <TextArea
          id="afterHoursTemplate"
          label="Text callers get when you're closed"
          value={shownAfterHours}
          onChange={setAfterHours}
          error={errors.afterHoursTemplate}
        />
      </HoursFields>
      <Preview
        businessName={businessName}
        template={shownTemplate}
        afterHoursTemplate={shownAfterHours}
        hours={hours.mode === 'set' ? { opens: hours.opens, closes: hours.closes } : null}
      />
      {state.status === 'error' && (
        <p role="alert" data-testid="setup-error" className="text-sm font-medium text-danger">
          {state.message}
        </p>
      )}
      {state.status === 'saved' && (
        <p role="status" data-testid="setup-saved" className="text-base font-medium text-ink">
          Saved. Callers you miss will get this text.
        </p>
      )}
      <Button type="submit" size="lg" fullWidth loading={pending}>
        {line ? 'Save changes' : 'Save and continue'}
      </Button>
    </form>
  );
}
