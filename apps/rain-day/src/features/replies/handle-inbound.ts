import { logger } from '@speedy/lib/logger';
import { isUsDomesticPhone, maskUsPhone, type E164 } from '@speedy/lib/phone';
import { classifyKeyword, helpReply } from '@speedy/sms/keywords';
import type { InboundMessage, SmsProvider } from '@speedy/sms/provider';
import { applyOptOutKeyword, type OptOutStore } from '@speedy/sms/send';

import { codeOf } from '@/features/rain-day/dispatch';

import { FORWARD_CAP_PER_HOUR, forwardText } from './forward';

export interface RecordedReply {
  matched: boolean;
  duplicate: boolean;
  replyId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  ownerCell: string | null;
  /** True when this reply must be forwarded now: a verified cell and under the hourly cap. */
  forward: boolean;
}

/**
 * Everything the inbound handler needs, resolved per owner: the number that was texted belongs
 * to exactly one owner, and every lookup after that stays inside that owner's data.
 */
export interface InboundStore {
  /** The owner whose texting number is `to`, or null when it is nobody's. */
  ownerForNumber(to: E164): Promise<string | null>;
  forOwner(ownerId: string): ReplyStore;
}

export interface ReplyStore {
  /** This owner's STOP list. START and YES clear only this owner's entry. */
  optOuts: OptOutStore;
  /** Atomic: match among this owner's customers, mark the message replied, store once per provider id, decide forwarding. */
  recordReply(input: {
    from: E164;
    providerMessageId: string;
    body: string;
    forwardCap: number;
  }): Promise<RecordedReply>;
  markForward(replyId: string, status: 'sent' | 'failed'): Promise<void>;
  /** The business name for a HELP reply, or null when this number is not one of this owner's customers. */
  helpBusinessName(phone: E164): Promise<string | null>;
  /** Atomic: true when a HELP reply may go to this number now, false if one went in 24 hours. */
  claimHelp(phone: E164): Promise<boolean>;
}

const log = logger.child({ feature: 'rain-day-inbound' });

async function reply(provider: SmsProvider, message: InboundMessage, body: string) {
  const sent = await provider.sendText({ to: message.from, from: message.to, body });
  if (!sent.ok) log.warn('inbound auto-reply failed', { code: sent.error.code });
}

async function forward(provider: SmsProvider, store: ReplyStore, message: InboundMessage) {
  const recorded = await store.recordReply({
    from: message.from,
    providerMessageId: message.providerMessageId,
    body: message.body,
    forwardCap: FORWARD_CAP_PER_HOUR,
  });
  if (!recorded.matched) {
    log.info('reply from a number this owner never texted, ignored', {
      from: maskUsPhone(message.from),
    });
    return;
  }
  if (recorded.duplicate || !recorded.forward || !recorded.replyId || !recorded.ownerCell) return;

  const cell = recorded.ownerCell as E164;
  let delivered = false;
  // Never leave a reply stuck at "Forwarding": anything but a clean send marks it failed.
  if (isUsDomesticPhone(cell)) {
    try {
      const sent = await provider.sendText({
        to: cell,
        from: message.to,
        body: forwardText(recorded.customerName ?? 'A customer', message.from, message.body),
      });
      delivered = sent.ok;
      if (!sent.ok) log.warn('forwarding a reply failed', { code: sent.error.code });
    } catch (error) {
      log.warn('forwarding a reply threw', { code: codeOf(error) });
    }
  } else {
    log.warn('owner cell is not a US number, not forwarding');
  }
  await store.markForward(recorded.replyId, delivered ? 'sent' : 'failed');
}

async function answerHelp(provider: SmsProvider, store: ReplyStore, message: InboundMessage) {
  // Only people on a customer list get an answer, and only once a day: HELP must not become a
  // way to make us text any number over and over.
  const business = await store.helpBusinessName(message.from);
  if (!business || !(await store.claimHelp(message.from))) return;
  await reply(provider, message, helpReply(business));
}

/**
 * Handle one text a customer sent to an owner's texting number. STOP always opts the number out
 * for that owner, whether or not they are on the owner's customer list (so a customer added
 * later is still skipped);
 * START, YES and UNSTOP opt it back in only when it is currently opted out (otherwise a plain
 * "Yes" is an ordinary reply and is forwarded). HELP gets the carrier-required line for known
 * customers, once a day. Anything else is a reply: filed under the latest rain-day text to them and
 * forwarded to the owner. Call only after the webhook signature was verified (`handleWebhook`).
 */
export async function handleInboundText(
  deps: { provider: SmsProvider; store: InboundStore },
  message: InboundMessage,
): Promise<void> {
  const { provider } = deps;
  const ownerId = await deps.store.ownerForNumber(message.to);
  if (!ownerId) {
    // Not any owner's number: store nothing, for anyone.
    log.info('text to a number that is not an owner’s, ignored', { to: maskUsPhone(message.to) });
    return;
  }
  const store = deps.store.forOwner(ownerId);
  const keyword = classifyKeyword(message.body);
  if (keyword === 'stop') {
    await applyOptOutKeyword(store.optOuts, message.from, keyword);
    return;
  }
  if (keyword === 'start' && (await store.optOuts.isOptedOut(message.from))) {
    await applyOptOutKeyword(store.optOuts, message.from, keyword);
    return;
  }
  if (keyword === 'help') {
    await answerHelp(provider, store, message);
    return;
  }
  await forward(provider, store, message);
}
