import { logger } from '@speedy/lib/logger';
import { formatUsPhone, maskUsPhone } from '@speedy/lib/phone';
import { classifyKeyword, helpReply } from '@speedy/sms/keywords';
import type { InboundMessage, SmsProvider } from '@speedy/sms/provider';
import { applyOptOutKeyword } from '@speedy/sms/send';

import type { MissedCallStore } from './store';

const log = logger.child({ feature: 'replies' });

/** One text message is at most 1600 characters; keep the forwarded lead well inside that. */
const MAX_FORWARD = 1000;

export interface ReplyDeps {
  provider: SmsProvider;
  store: MissedCallStore;
}

/** "New lead from (239) 555-0123: <reply>", the reply trimmed so the whole text fits. */
export function leadText(caller: string, reply: string): string {
  const head = `New lead from ${formatUsPhone(caller)}: `;
  const room = MAX_FORWARD - head.length;
  const body = reply.trim();
  return head + (body.length > room ? `${body.slice(0, room - 1)}…` : body);
}

/**
 * Called from the inbound text webhook once the provider signature has been verified. STOP and
 * START change the caller's opt-out, HELP gets the standard answer, and anything else is a reply
 * to the missed-call text: it is attached to the caller's latest call, marks it replied and is
 * forwarded to the owner's cell. Texts from numbers that never called are ignored.
 */
export async function handleReply(deps: ReplyDeps, message: InboundMessage): Promise<void> {
  const { provider, store } = deps;
  const line = await store.findLineByNumber(message.to);
  if (!line) {
    log.warn('text to a number with no line', { to: maskUsPhone(message.to) });
    return;
  }

  const keyword = classifyKeyword(message.body);
  if (keyword === 'stop' || keyword === 'start') {
    await applyOptOutKeyword(store.optOuts(line.id), message.from, keyword);
    return;
  }
  if (keyword === 'help') {
    await provider.sendText({
      to: message.from,
      from: line.providerNumber,
      body: helpReply(line.businessName),
    });
    return;
  }

  const saved = await store.recordReply(
    line.id,
    message.from,
    message.body,
    message.providerMessageId,
  );
  log.info('reply handled', {
    line: line.id,
    caller: maskUsPhone(message.from),
    outcome: saved.outcome,
  });
  if (saved.outcome !== 'recorded') return;

  const sent = await provider.sendText({
    to: line.ownerCell as `+1${string}`,
    from: line.providerNumber,
    body: leadText(message.from, message.body),
  });
  // The reply is saved either way; the owner still sees it in the list.
  if (!sent.ok) log.error('could not forward the lead', { line: line.id, code: sent.error.code });
}
