import { logger } from '@speedy/lib/logger';
import type { E164 } from '@speedy/lib/phone';

import type { OwnerSettings } from './owner-cell';

/**
 * How an owner's texts go out: from their own number, through their own Messaging Service (the
 * service carries their A2P campaign). Every send path uses this, so none of them can send with a
 * half-configured owner.
 */
export interface Sender {
  from: E164;
  messagingServiceSid?: string;
}

type SenderSettings = Pick<OwnerSettings, 'sender_number' | 'sender_messaging_service_sid'>;

const log = logger.child({ feature: 'rain-day-sender' });

/**
 * The owner's sender, or null when they are not ready to text: no number yet, or (with a real
 * provider) no Messaging Service. The fake provider needs no service. Null means refuse: the send
 * button is off, and a forward, HELP answer or confirmation code is treated as failed.
 */
export function resolveSender(
  settings: SenderSettings | null,
  providerName: string,
): Sender | null {
  const from = settings?.sender_number as E164 | null | undefined;
  if (!from) return null;
  const sid = settings?.sender_messaging_service_sid ?? undefined;
  if (!sid && providerName !== 'fake') {
    log.warn('owner has no messaging service');
    return null;
  }
  return { from, ...(sid ? { messagingServiceSid: sid } : {}) };
}

/** The `messagingServiceSid` part of a send, spread into the provider call when there is one. */
export function serviceOf(sender: Sender): { messagingServiceSid?: string } {
  return sender.messagingServiceSid ? { messagingServiceSid: sender.messagingServiceSid } : {};
}
