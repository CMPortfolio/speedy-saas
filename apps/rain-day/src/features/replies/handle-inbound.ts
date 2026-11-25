import { logger } from '@speedy/lib/logger';
import { maskUsPhone, type E164 } from '@speedy/lib/phone';
import { classifyKeyword, helpReply } from '@speedy/sms/keywords';
import type { InboundMessage, SmsProvider } from '@speedy/sms/provider';
import { applyOptOutKeyword, type OptOutStore } from '@speedy/sms/send';

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

export interface ReplyStore {
  optOuts: OptOutStore;
  /** Atomic: match, mark the message replied, store once per provider id, decide forwarding. */
  recordReply(input: {
    from: E164;
    providerMessageId: string;
    body: string;
    forwardCap: number;
  }): Promise<RecordedReply>;
  markForward(replyId: string, status: 'sent' | 'failed'): Promise<void>;
  /** The business name of whoever texted this number last, for the HELP reply. */
  businessNameFor(phone: E164): Promise<string | null>;
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
    log.info('reply from a number we never texted, ignored', { from: maskUsPhone(message.from) });
    return;
  }
  if (recorded.duplicate || !recorded.forward || !recorded.replyId || !recorded.ownerCell) return;

  const sent = await provider.sendText({
    to: recorded.ownerCell as E164,
    from: message.to,
    body: forwardText(recorded.customerName ?? 'A customer', message.from, message.body),
  });
  if (!sent.ok) log.warn('forwarding a reply failed', { code: sent.error.code });
  await store.markForward(recorded.replyId, sent.ok ? 'sent' : 'failed');
}

/**
 * Handle one text a customer sent to the business number. STOP and START change opt-out for that
 * number (the carrier sends the confirmation), HELP gets the carrier-required line, and anything
 * else is a reply: filed under the latest rain-day text to them and forwarded to the owner.
 * Call only after the webhook signature was verified (`handleWebhook` does that).
 */
export async function handleInboundText(
  deps: { provider: SmsProvider; store: ReplyStore },
  message: InboundMessage,
): Promise<void> {
  const keyword = classifyKeyword(message.body);
  if (keyword === 'stop' || keyword === 'start') {
    await applyOptOutKeyword(deps.store.optOuts, message.from, keyword);
    return;
  }
  if (keyword === 'help') {
    const business = (await deps.store.businessNameFor(message.from)) ?? 'Rain Day';
    await reply(deps.provider, message, helpReply(business));
    return;
  }
  await forward(deps.provider, deps.store, message);
}
