'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { formatUsPhone } from '@speedy/lib/phone';
import { Button } from '@speedy/ui/button';

import { saveSetup } from './actions';
import { HoursFields, TextArea, TextField, type HoursValue } from './fields';
import { DEFAULT_OPEN_HOURS } from './hours';
import type { MyLine } from './line-queries';
import { Preview } from './preview';
import { idleSetup } from './save-setup';
import { defaultAfterHoursTemplate, defaultTemplate, type SetupField } from './schema';

/** The order the fields appear in, which is the order errors are listed and focused. */
const FIELD_ORDER: readonly SetupField[] = [
  'businessName',
  'ownerCell',
  'template',
  'hours',
  'afterHoursTemplate',
];

const LABELS: Record<SetupField, string> = {
  businessName: 'Business name',
  ownerCell: 'Your cell number',
  template: 'Text callers get when you miss them',
  hours: 'Your hours',
  afterHoursTemplate: "Text callers get when you're closed",
};

/**
 * A text the owner has not edited follows the business name; once they type in it, it is theirs.
 * Clearing it leaves it empty (the preview falls back to the suggestion, saving does not).
 */
function useFollowingText(saved: string | null | undefined, suggestion: string) {
  const [text, setText] = useState(saved ?? '');
  const [touched, setTouched] = useState(Boolean(saved));
  return {
    value: touched ? text : suggestion,
    set: (next: string) => {
      setText(next);
      setTouched(true);
    },
  };
}

function useSetupFields(line: MyLine | null) {
  const [businessName, setBusinessName] = useState(line?.businessName ?? '');
  const [ownerCell, setOwnerCell] = useState(line ? formatUsPhone(line.ownerCell) : '');
  const template = useFollowingText(line?.template, defaultTemplate(businessName));
  const afterHours = useFollowingText(
    line?.afterHoursTemplate,
    defaultAfterHoursTemplate(businessName),
  );
  const [hours, setHours] = useState<HoursValue>(
    line?.quietHours
      ? { mode: 'set', opens: line.quietHours.end, closes: line.quietHours.start }
      : { mode: 'always', ...DEFAULT_OPEN_HOURS },
  );
  return {
    businessName,
    setBusinessName,
    ownerCell,
    setOwnerCell,
    template,
    afterHours,
    hours,
    setHours,
  };
}

/** One alert above the form listing what to fix, with links to the fields. */
function ErrorSummary({
  errors,
  summaryRef,
}: {
  errors: Partial<Record<SetupField, string>>;
  summaryRef: React.RefObject<HTMLDivElement | null>;
}) {
  const fields = FIELD_ORDER.filter((f) => errors[f]);
  if (fields.length === 0) return null;
  return (
    <div
      ref={summaryRef}
      role="alert"
      tabIndex={-1}
      data-testid="setup-errors"
      className="space-y-1 rounded-brand border border-danger p-3 text-sm"
    >
      <p className="font-medium text-danger">
        {fields.length === 1 ? 'One thing to fix:' : `${fields.length} things to fix:`}
      </p>
      <ul className="list-disc pl-5">
        {fields.map((f) => (
          <li key={f}>
            <a href={`#${f}`} className="underline">
              {LABELS[f]}
            </a>
            : {errors[f]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Business name, cell, the text callers get (with a live preview), after-hours text and hours. */
export function SetupForm({ line, numberReady }: { line: MyLine | null; numberReady: boolean }) {
  const [state, action, pending] = useActionState(saveSetup, idleSetup);
  const errors = state.status === 'invalid' ? state.errors : {};
  const f = useSetupFields(line);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  // After a failed save, move focus to the first field that needs fixing.
  useEffect(() => {
    if (state.status !== 'invalid') return;
    const first = FIELD_ORDER.find((name) => state.errors[name]);
    const target = first ? document.getElementById(first) : null;
    (target ?? summaryRef.current)?.focus();
  }, [state]);

  return (
    <form action={action} className="space-y-6" data-testid="setup-form" noValidate>
      <ErrorSummary errors={errors} summaryRef={summaryRef} />
      <TextField
        id="businessName"
        label="Business name"
        value={f.businessName}
        onChange={f.setBusinessName}
        autoComplete="organization"
        error={errors.businessName}
      />
      <TextField
        id="ownerCell"
        label="Your cell number"
        type="tel"
        autoComplete="tel"
        value={f.ownerCell}
        onChange={f.setOwnerCell}
        hint="Where leads get texted to you."
        error={errors.ownerCell}
      />
      <TextArea
        id="template"
        label={LABELS.template}
        value={f.template.value}
        onChange={f.template.set}
        error={errors.template}
      />
      <HoursFields value={f.hours} onChange={f.setHours} error={errors.hours}>
        <TextArea
          id="afterHoursTemplate"
          label={LABELS.afterHoursTemplate}
          value={f.afterHours.value}
          onChange={f.afterHours.set}
          error={errors.afterHoursTemplate}
        />
      </HoursFields>
      <Preview
        businessName={f.businessName}
        template={f.template.value.trim() ? f.template.value : defaultTemplate(f.businessName)}
        afterHoursTemplate={
          f.afterHours.value.trim() ? f.afterHours.value : defaultAfterHoursTemplate(f.businessName)
        }
        hours={f.hours.mode === 'set' ? { opens: f.hours.opens, closes: f.hours.closes } : null}
      />
      {state.status === 'error' && (
        <p role="alert" data-testid="setup-error" className="text-sm font-medium text-danger">
          {state.message}
        </p>
      )}
      {state.status === 'saved' && (
        <p role="status" data-testid="setup-saved" className="text-base font-medium text-ink">
          {numberReady
            ? 'Saved. Callers you miss will get this text.'
            : "Saved. Your missed-call number isn't ready yet, so callers won't get this text until it is."}
        </p>
      )}
      <Button type="submit" size="lg" fullWidth loading={pending}>
        {line ? 'Save changes' : 'Save and continue'}
      </Button>
    </form>
  );
}
