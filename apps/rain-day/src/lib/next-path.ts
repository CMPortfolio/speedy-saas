import { safeNext } from '@speedy/auth/safe-next';

/** Where an owner lands after signing in when there is no usable `next`. */
export const DEFAULT_NEXT = '/rain-day';

/** The pages that exist in this app. A `next` for any other page would end on a 404. */
const OWN_PAGES = /^\/(customers|rain-day|settings)(?:[/?#]|$)/;

/**
 * The page to go to after sign-in: a page of this app, or Rain day.
 *
 * The shared sign-in only checks that `next` stays on the same site. All tools share one sign-in
 * cookie and one set of sign-in links, so a `next` that belongs to another tool (Missed Call's
 * /setup, for example) is easy to arrive with and, here, is a page that does not exist.
 */
export function rainDayNext(next: string | null | undefined): string {
  const safe = safeNext(next);
  return OWN_PAGES.test(safe) ? safe : DEFAULT_NEXT;
}
