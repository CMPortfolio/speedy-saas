import { logger } from '@speedy/lib/logger';
import { maskUsPhone, type E164 } from '@speedy/lib/phone';
import { appError, err, type Result } from '@speedy/lib/result';

import { withOptOutFooter, type Keyword } from './keywords';
import type { SendTextOutput, SmsProvider } from './provider';

/**
 * Opt-out state lives with the tool (its own schema), not in this package. A tool implements
 * this with two queries; tests use an in-memory Map.
 *
 * `isOptedOut` means "this number texted STOP" (and not START since). A tool may use a wider
 * store for the send guard (e.g. also its own blocked list) but must give `applyOptOutKeyword` the
 * STOP list alone, or a blocked number's STOP would be mistaken for "already opted out" and lost.
 */
export interface OptOutStore {
  isOptedOut(number: E164): Promise<boolean>;
  setOptedOut(number: E164, optedOut: boolean): Promise<void>;
}

export interface SendFirstOrFollowupInput {
  to: E164;
  from: E164;
  body: string;
  businessName: string;
  /** True for the first text ever to this number: the opt-out footer is added. */
  isFirstContact: boolean;
  /** The business's own Messaging Service, when it has one (see SendTextInput). */
  messagingServiceSid?: string | undefined;
}

const log = logger.child({ pkg: 'sms' });

/**
 * Send a text the compliant way: never to an opted-out number (error code `opted_out`), and
 * with the business name and "Reply STOP to opt out" on the first contact.
 */
export async function sendFirstOrFollowup(
  provider: SmsProvider,
  store: OptOutStore,
  input: SendFirstOrFollowupInput,
): Promise<Result<SendTextOutput>> {
  if (await store.isOptedOut(input.to)) {
    log.info('text skipped, number opted out', { to: maskUsPhone(input.to) });
    return err(appError('opted_out', 'This number has asked not to receive texts.'));
  }
  const body = input.isFirstContact ? withOptOutFooter(input.body, input.businessName) : input.body;
  return provider.sendText({
    to: input.to,
    from: input.from,
    body,
    ...(input.messagingServiceSid ? { messagingServiceSid: input.messagingServiceSid } : {}),
  });
}

/**
 * Record a STOP or START keyword in the store. Returns true when the state changed, so the
 * caller knows whether to send the confirmation the carriers expect.
 */
export async function applyOptOutKeyword(
  store: OptOutStore,
  number: E164,
  keyword: Keyword,
): Promise<boolean> {
  if (keyword !== 'stop' && keyword !== 'start') return false;
  const optedOut = keyword === 'stop';
  if ((await store.isOptedOut(number)) === optedOut) return false;
  await store.setOptedOut(number, optedOut);
  log.info(optedOut ? 'number opted out' : 'number opted back in', { to: maskUsPhone(number) });
  return true;
}
