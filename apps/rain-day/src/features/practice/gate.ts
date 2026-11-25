import type { OwnerSettings } from '@/features/settings/owner-cell';
import { resolveSender } from '@/features/settings/sender';

/**
 * Practice mode is decided here, on the server, from the owner's own settings and nothing the
 * client sends: an owner with NO texting number yet is in practice mode. Any number at all turns it
 * off, even before the Messaging Service is set, so practice can never stand in for a number that
 * has been assigned. Every practice action asks again.
 */
export function isPracticeOwner(settings: OwnerSettings | null): boolean {
  return !settings?.sender_number;
}

/**
 * What the owner can do with the send button:
 *  - practice: no number yet, send as practice
 *  - ready: a number (and, with a real provider, a Messaging Service), send for real
 *  - blocked: a number but not yet the Messaging Service, so neither
 */
export type SendMode = 'practice' | 'ready' | 'blocked';

export function sendMode(settings: OwnerSettings | null, providerName: string): SendMode {
  if (isPracticeOwner(settings)) return 'practice';
  return resolveSender(settings, providerName) ? 'ready' : 'blocked';
}

export const PRACTICE_REFUSED =
  'Practice is only for owners whose texting number is not set up yet.';
export const PRACTICE_RATE_LIMITED = 'You are going quickly. Wait a few minutes and try again.';
export const PRACTICE_FULL = 'Your practice phone is full. Clear practice first, then try again.';
