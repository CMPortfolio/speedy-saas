/**
 * No-answer call forwarding dial codes, one entry per carrier. This is the only place the codes
 * live: correct a code or flip `verified` here and the setup page follows.
 *
 * Sources and status are in apps/missed-call/LAUNCH.md. Verizon's code is confirmed on Verizon's
 * own page. T-Mobile's cancel code is on T-Mobile's page and the activate code is the GSM standard;
 * AT&T's codes are the GSM standard (no AT&T page confirms them). Those two carry a "test call" note.
 */
export interface Carrier {
  id: 'verizon' | 'tmobile' | 'att';
  name: string;
  /** Dial this from the phone to forward only the calls you do not answer. */
  activate: (tenDigits: string) => string;
  /** Dial this to turn forwarding off again. */
  cancel: string;
  /** Dial this to see whether forwarding is on, when the carrier has such a code. */
  status?: string;
  /** True only when the carrier's own support page confirms the activate code. */
  verified: boolean;
  sourceUrl: string;
  note?: string;
}

export const CARRIERS: readonly Carrier[] = [
  {
    id: 'verizon',
    name: 'Verizon',
    activate: (n) => `*71${n}`,
    cancel: '*73',
    verified: true,
    sourceUrl: 'https://www.verizon.com/support/how-to-use-call-forwarding',
    note: 'Dial it from your phone. It will not work while you are roaming, and forwarded calls are billed as answered.',
  },
  {
    id: 'tmobile',
    name: 'T-Mobile',
    activate: (n) => `**61*1${n}#`,
    cancel: '##61#',
    status: '*#61#',
    verified: false,
    sourceUrl: 'https://www.t-mobile.com/support/plans-features/self-service-short-codes/',
    note: 'Check with a test call after setting this up.',
  },
  {
    id: 'att',
    name: 'AT&T',
    activate: (n) => `**61*1${n}#`,
    cancel: '##61#',
    status: '*#61#',
    verified: false,
    sourceUrl: 'https://en.wikipedia.org/wiki/Call_forwarding',
    note: 'Check with a test call after setting this up.',
  },
];

export const FORWARDING_FALLBACK =
  'Another carrier or a prepaid plan? Open your phone\'s settings and turn on Call Forwarding, then choose "When unanswered" (sometimes called "No answer"), or call your carrier and ask for no-answer forwarding.';

/** The ten digits a code is dialed with, from an E.164 number. */
export function dialDigits(e164: string): string {
  return e164.replace(/^\+1/, '');
}
