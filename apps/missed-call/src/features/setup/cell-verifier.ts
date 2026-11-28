import { formatUsPhone, isUsDomesticPhone, normalizeUsPhone } from '@speedy/lib/phone';
import type { E164 } from '@speedy/lib/phone';
import type { SmsProvider } from '@speedy/sms/provider';
import {
  checkPhoneVerification,
  startPhoneVerification,
  type VerifyStore,
} from '@speedy/sms/verify-phone';

/**
 * Confirming the owner's cell with a texted 6-digit code. Replies are only forwarded to a cell that
 * has been confirmed here. The rules (10 minutes, five tries, three codes an hour) are
 * @speedy/sms/verify-phone's; this file adds the owner-facing words and the line rules: the code
 * goes to the cell on the owner's line, from the line's number, and confirming only counts if the
 * cell on the line is still the one the code went to.
 */
export interface CellLine {
  ownerCell: string;
  ownerCellVerified: boolean;
  providerNumber: string | null;
  businessName: string;
}

export interface CellVerifierDeps {
  provider: SmsProvider;
  store: VerifyStore;
  loadLine(ownerId: string): Promise<CellLine | null>;
  /** Marks the line verified only if its cell is still `phone`. False means it changed. */
  markVerified(ownerId: string, phone: E164): Promise<boolean>;
  now?: () => Date;
  random?: (max: number) => number;
}

export type CellFailure =
  | 'no_line'
  | 'no_number'
  | 'already_confirmed'
  | 'bad_cell'
  | 'rate_limited'
  | 'invalid_number'
  | 'failed'
  | 'wrong'
  | 'expired'
  | 'locked'
  | 'none'
  | 'cell_changed';

export type CellOutcome =
  { ok: true; message: string } | { ok: false; code: CellFailure; message: string };

const fail = (code: CellFailure, message: string): CellOutcome => ({ ok: false, code, message });

const MESSAGES = {
  no_line: 'Save your setup first, then confirm your cell.',
  no_number:
    "Your missed-call number isn't ready yet, so we can't text you a code. It shows up on this page when it is.",
  already_confirmed: 'Your cell is already confirmed.',
  bad_cell: 'Fix your cell number above and save it first.',
  rate_limited: 'Too many codes sent for now. Try again later.',
  invalid_number: 'That number cannot receive texts. Check it and save it again.',
  failed: 'We could not send the code just now. Try again in a minute.',
  expired: 'That code expired. Send a new one.',
  locked: 'Too many wrong tries. Send a new code.',
  none: 'Send a code first.',
  cell_changed: 'You changed your cell number after we sent that code. Send a new one.',
} as const;

export function wrongCodeMessage(attemptsLeft: number): string {
  return `That code is not right. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`;
}

export interface OwnerCellVerifier {
  /** Text a code to the cell on the owner's line. */
  start(ownerId: string): Promise<CellOutcome>;
  /** Check the typed code and, if it is right and the cell is unchanged, confirm the cell. */
  confirm(ownerId: string, code: string): Promise<CellOutcome>;
}

export function createOwnerCellVerifier(deps: CellVerifierDeps): OwnerCellVerifier {
  const clock = deps.now ? { now: deps.now } : {};
  return {
    async start(ownerId) {
      const line = await deps.loadLine(ownerId);
      if (!line) return fail('no_line', MESSAGES.no_line);
      if (line.ownerCellVerified) return fail('already_confirmed', MESSAGES.already_confirmed);
      const from = line.providerNumber ? normalizeUsPhone(line.providerNumber) : null;
      if (!from) return fail('no_number', MESSAGES.no_number);
      const phone = normalizeUsPhone(line.ownerCell);
      if (!phone || !isUsDomesticPhone(phone)) return fail('bad_cell', MESSAGES.bad_cell);

      const result = await startPhoneVerification(
        {
          provider: deps.provider,
          store: deps.store,
          ...clock,
          ...(deps.random ? { random: deps.random } : {}),
        },
        {
          subject: ownerId,
          phone,
          from,
          message: (code) =>
            `Your ${line.businessName} missed-call code is ${code}. It expires in 10 minutes.`,
        },
      );
      if (result.ok) {
        return {
          ok: true,
          message: `We texted a code to ${formatUsPhone(phone)}. It lasts 10 minutes.`,
        };
      }
      if (result.error.code === 'rate_limited') return fail('rate_limited', MESSAGES.rate_limited);
      if (result.error.code === 'invalid_number') {
        return fail('invalid_number', MESSAGES.invalid_number);
      }
      return fail('failed', MESSAGES.failed);
    },

    async confirm(ownerId, code) {
      const outcome = await checkPhoneVerification(
        { store: deps.store, ...clock },
        { subject: ownerId, code },
      );
      if (outcome.status === 'wrong') {
        return fail('wrong', wrongCodeMessage(outcome.attemptsLeft));
      }
      if (outcome.status !== 'verified') return fail(outcome.status, MESSAGES[outcome.status]);
      // The code proved control of the number it was sent to. Only that number counts: if the
      // owner changed the cell on the line since, nothing is confirmed.
      const confirmed = await deps.markVerified(ownerId, outcome.phone);
      if (!confirmed) return fail('cell_changed', MESSAGES.cell_changed);
      return { ok: true, message: 'Your cell is confirmed. Replies will be texted to you.' };
    },
  };
}
