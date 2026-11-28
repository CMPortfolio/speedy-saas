import { isUsDomesticPhone, normalizeUsPhone } from '@speedy/lib/phone';

import { parseQuietHours, type QuietHours } from '../missed-calls/quiet-hours';
import { DEFAULT_OPEN_HOURS, toQuietHours } from './hours';

/** What the setup form saves to missed_call.lines. Column names, ready to insert or update. */
export interface LineInput {
  business_name: string;
  owner_cell: string;
  template: string;
  after_hours_template: string | null;
  quiet_hours: QuietHours | null;
}

export type SetupField = 'businessName' | 'ownerCell' | 'template' | 'afterHoursTemplate' | 'hours';

export type SetupParse =
  { ok: true; value: LineInput } | { ok: false; errors: Partial<Record<SetupField, string>> };

export const MAX_TEMPLATE = 320;

/** The text callers get until the owner writes their own. */
export function defaultTemplate(businessName: string): string {
  const who = businessName.trim() || 'us';
  return `Hi, this is ${who}. Sorry we missed your call. What do you need, and where are you? We'll get back to you as soon as we can.`;
}

export function defaultAfterHoursTemplate(businessName: string): string {
  const who = businessName.trim() || 'us';
  return `Hi, this is ${who}. We're closed right now. Tell us what you need and we'll call you first thing when we open.`;
}

type Errors = Partial<Record<SetupField, string>>;

const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();

function checkName(name: string): string | undefined {
  if (!name) return 'Enter your business name.';
  return name.length > 120 ? 'Keep the business name under 120 characters.' : undefined;
}

function checkTemplate(value: string, required: boolean): string | undefined {
  if (required && !value) return 'Write the text callers get.';
  return value.length > MAX_TEMPLATE ? `Keep it under ${MAX_TEMPLATE} characters.` : undefined;
}

function parseHours(data: FormData): QuietHours | null | 'invalid' {
  if (text(data, 'hours') !== 'set') return null;
  const opens = text(data, 'opens') || DEFAULT_OPEN_HOURS.opens;
  const closes = text(data, 'closes') || DEFAULT_OPEN_HOURS.closes;
  return parseQuietHours(toQuietHours({ opens, closes })) ?? 'invalid';
}

/** Validate the setup form. Messages are written for the owner. */
export function parseSetup(data: FormData): SetupParse {
  const errors: Errors = {};
  const businessName = text(data, 'businessName');
  const cell = text(data, 'ownerCell');
  const ownerCell = normalizeUsPhone(cell);
  const template = text(data, 'template');
  const afterHours = text(data, 'afterHoursTemplate');
  const quietHours = parseHours(data);

  const found: Record<SetupField, string | undefined> = {
    businessName: checkName(businessName),
    ownerCell:
      ownerCell && isUsDomesticPhone(cell)
        ? undefined
        : 'Enter the cell number you answer, with area code.',
    template: checkTemplate(template, true),
    afterHoursTemplate: checkTemplate(afterHours, false),
    hours:
      quietHours === 'invalid' ? 'Pick an opening time and a different closing time.' : undefined,
  };
  for (const [field, message] of Object.entries(found)) {
    if (message) errors[field as SetupField] = message;
  }

  if (Object.keys(errors).length > 0 || !ownerCell || quietHours === 'invalid') {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      business_name: businessName,
      owner_cell: ownerCell,
      template,
      after_hours_template: afterHours || null,
      quiet_hours: quietHours,
    },
  };
}
