import type { PracticeLine } from './practice-flow';
import { practiceModeFor } from './practice-mode';

export interface GuardLine {
  providerNumber: string | null;
  messagingServiceSid: string | null;
  businessName: string;
  template: string;
  afterHoursTemplate: string | null;
  quietHours: unknown;
  timezone: string;
  ownerCell: string;
}

export type Guarded = { ok: true; line: PracticeLine } | { ok: false; message: string };

/**
 * Every practice action goes through this first, on the server, with the line read from the
 * database for the signed-in owner. Practice is refused when there is no saved line, and refused
 * again the moment the line has any number: there is nothing a request can send to get past it.
 */
export function guardPractice(line: GuardLine | null): Guarded {
  if (!line) return { ok: false, message: 'Save your setup first, then you can practice.' };
  if (!practiceModeFor(line)) {
    return {
      ok: false,
      message: 'Your missed-call number is set, so practice is switched off. Use real calls.',
    };
  }
  return {
    ok: true,
    line: {
      businessName: line.businessName,
      template: line.template,
      afterHoursTemplate: line.afterHoursTemplate,
      quietHours: line.quietHours,
      timezone: line.timezone,
      ownerCell: line.ownerCell,
    },
  };
}
