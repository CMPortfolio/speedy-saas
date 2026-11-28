import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { logger } from '@speedy/lib/logger';
import { maskUsPhone, type E164 } from '@speedy/lib/phone';
import { appError, err, ok, type Result } from '@speedy/lib/result';

import type { SmsProvider } from './provider';

/**
 * Prove someone controls a cell number: text a 6-digit code, accept it back once.
 *
 * The rules live here so every tool behaves the same: the code expires in 10 minutes, five wrong
 * tries kill it, and one subject (a signed-in owner) can have three codes texted per hour.
 * Storage is the tool's job (its own schema) behind `VerifyStore`; only a salted hash of the
 * code is ever stored, and the code is never logged.
 */
export const VERIFY_RULES = {
  codeLength: 6,
  ttlMs: 10 * 60_000,
  maxAttempts: 5,
  maxSendsPerWindow: 3,
  windowMs: 60 * 60_000,
} as const;

export interface VerifyChallenge {
  /** The number the code was texted to. */
  phone: E164;
  codeHash: string;
  salt: string;
  expiresAt: Date;
  attempts: number;
}

/**
 * One pending challenge per subject. The methods marked atomic must be atomic in the store
 * (a SQL function or a single statement), or two requests at once could get past the limits.
 */
export interface VerifyStore {
  /** Atomic: count sends in the window and record this one, or refuse (false) at the limit. */
  reserveSend(subject: string, limit: number, windowMs: number, now: Date): Promise<boolean>;
  /** Replace any pending challenge; attempts start at 0. */
  saveChallenge(subject: string, challenge: Omit<VerifyChallenge, 'attempts'>): Promise<void>;
  getChallenge(subject: string): Promise<VerifyChallenge | null>;
  /** Atomic: add one to the attempts and return the new count, or null if there is no challenge. */
  consumeAttempt(subject: string): Promise<number | null>;
  clearChallenge(subject: string): Promise<void>;
}

export function generateCode(random: (max: number) => number = (max) => randomInt(max)): string {
  return String(random(10 ** VERIFY_RULES.codeLength)).padStart(VERIFY_RULES.codeLength, '0');
}

export function hashCode(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export interface StartDeps {
  provider: SmsProvider;
  store: VerifyStore;
  now?: () => Date;
  /** Test seam for the code. Default: crypto.randomInt. */
  random?: (max: number) => number;
}

export interface StartInput {
  /** Who is verifying: the signed-in owner's id. */
  subject: string;
  phone: E164;
  from: E164;
  /** The business's own Messaging Service, when it has one (see SendTextInput). */
  messagingServiceSid?: string | undefined;
  /** Wording of the text. Default: "Your verification code is 123456. It expires in 10 minutes." */
  message?: (code: string) => string;
}

const log = logger.child({ pkg: 'sms', where: 'verify-phone' });

const defaultMessage = (code: string) =>
  `Your verification code is ${code}. It expires in 10 minutes.`;

/**
 * Text a fresh code to `phone`. Error codes: `rate_limited` (three codes already went out this
 * hour, nothing is sent) or the provider's own (`provider_failed`, `invalid_number`).
 */
export async function startPhoneVerification(
  deps: StartDeps,
  input: StartInput,
): Promise<Result<{ expiresAt: Date }>> {
  const now = (deps.now ?? (() => new Date()))();
  const { store } = deps;
  const allowed = await store.reserveSend(
    input.subject,
    VERIFY_RULES.maxSendsPerWindow,
    VERIFY_RULES.windowMs,
    now,
  );
  if (!allowed) {
    log.info('verification code refused, too many this hour', { to: maskUsPhone(input.phone) });
    return err(appError('rate_limited', 'Too many codes sent. Try again in an hour.'));
  }

  const code = generateCode(deps.random);
  const salt = randomBytes(16).toString('hex');
  const expiresAt = new Date(now.getTime() + VERIFY_RULES.ttlMs);
  await store.saveChallenge(input.subject, {
    phone: input.phone,
    codeHash: hashCode(code, salt),
    salt,
    expiresAt,
  });

  const sent = await deps.provider.sendText({
    to: input.phone,
    from: input.from,
    body: (input.message ?? defaultMessage)(code),
    ...(input.messagingServiceSid ? { messagingServiceSid: input.messagingServiceSid } : {}),
  });
  if (!sent.ok) {
    await store.clearChallenge(input.subject);
    return err(sent.error);
  }
  return ok({ expiresAt });
}

export type VerifyOutcome =
  | { status: 'verified'; phone: E164 }
  | { status: 'wrong'; attemptsLeft: number }
  | { status: 'expired' }
  | { status: 'locked' }
  | { status: 'none' };

/**
 * Check a typed code. A right code works once. `locked` means the fifth wrong try just killed it;
 * `expired` means ten minutes passed; `none` means there is nothing pending (never sent, already
 * used or locked). Every check of a well-formed code uses an attempt, counted before comparing.
 */
export async function checkPhoneVerification(
  deps: { store: VerifyStore; now?: () => Date },
  input: { subject: string; code: string },
): Promise<VerifyOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const { store } = deps;
  const challenge = await store.getChallenge(input.subject);
  if (!challenge) return { status: 'none' };
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    await store.clearChallenge(input.subject);
    return { status: 'expired' };
  }

  const code = input.code.replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${VERIFY_RULES.codeLength}}$`).test(code)) {
    return {
      status: 'wrong',
      attemptsLeft: Math.max(0, VERIFY_RULES.maxAttempts - challenge.attempts),
    };
  }

  const attempts = await store.consumeAttempt(input.subject);
  if (attempts === null) return { status: 'none' };
  if (attempts > VERIFY_RULES.maxAttempts) {
    await store.clearChallenge(input.subject);
    return { status: 'locked' };
  }
  if (sameHash(hashCode(code, challenge.salt), challenge.codeHash)) {
    await store.clearChallenge(input.subject);
    return { status: 'verified', phone: challenge.phone };
  }
  if (attempts >= VERIFY_RULES.maxAttempts) {
    await store.clearChallenge(input.subject);
    return { status: 'locked' };
  }
  return { status: 'wrong', attemptsLeft: VERIFY_RULES.maxAttempts - attempts };
}
