import { resolveSender } from '@/features/settings/sender';
import type { OwnerSettings } from '@/features/settings/owner-cell';

/**
 * Practice mode is decided here, on the server, from the owner's own settings and nothing the
 * client sends: an owner with no real texting number (and, with a real provider, no Messaging
 * Service) is in practice mode. The moment an admin gives them both, this turns false and every
 * practice action is refused.
 */
export function isPracticeOwner(settings: OwnerSettings | null, providerName: string): boolean {
  return resolveSender(settings, providerName) === null;
}

export const PRACTICE_REFUSED =
  'Practice is only for owners whose texting number is not set up yet.';
export const PRACTICE_RATE_LIMITED = 'You are going quickly. Wait a few minutes and try again.';
export const PRACTICE_FULL = 'Your practice phone is full. Clear practice first, then try again.';
