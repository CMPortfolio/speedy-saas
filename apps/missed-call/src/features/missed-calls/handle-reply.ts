import { logger } from '@speedy/lib/logger';
import { formatUsPhone, isUsDomesticPhone, maskUsPhone, normalizeUsPhone } from '@speedy/lib/phone';
import { classifyKeyword, helpReply } from '@speedy/sms/keywords';
import type { InboundMessage, SmsProvider } from '@speedy/sms/provider';
import { applyOptOutKeyword } from '@speedy/sms/send';

import type { LineRecord, MissedCallStore } from './store';

const log = logger.child({ feature: 'replies' });

/** A forwarded lead is one or two text segments, not a wall of text. */
const MAX_FORWARD = 300;

export interface ReplyDeps {
  provider: SmsProvider;
  store: MissedCallStore;
}

/** "New lead from (239) 555-0123: <reply>", the reply trimmed so the whole text fits. */
export function leadText(caller: string, reply: string): string {
  const head = `New lead from ${formatUsPhone(caller)}: `;
  const room = MAX_FORWARD - head.length;
  const body = reply.trim();
  const chars = Array.from(body); // by character, so an emoji is never cut in half
  return head + (chars.length > room ? `${chars.slice(0, room - 1).join('')}…` : body);
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

  // Same rule as the auto-text: nothing is sent to or because of a number outside the US.
  if (!isUsDomesticPhone(message.from)) {
    log.warn('reply from a non-US number ignored', { caller: maskUsPhone(message.from) });
    return;
  }

  const keyword = classifyKeyword(message.body);
  if (keyword === 'stop') {
    await applyOptOutKeyword(store.stopList(line.id), message.from, keyword);
    return;
  }
  // START, YES and UNSTOP only mean "opt back in" from a number that had texted STOP. From anyone
  // else, "Yes" is an answer to the owner's question and goes through as a normal reply.
  if (keyword === 'start') {
    if (await applyOptOutKeyword(store.stopList(line.id), message.from, keyword)) return;
  }
  if (keyword === 'help') {
    const body = helpReply(line.businessName);
    // Only to numbers that called this line, once a day; the carrier-level HELP reply is separate.
    if (await store.claimHelpReply(line.id, message.from, body)) {
      await provider.sendText({ to: message.from, from: line.providerNumber, body });
    }
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
  if (saved.outcome === 'rate_limited') {
    log.warn('reply saved but not forwarded: too many lately', { line: line.id });
    return;
  }
  if (saved.outcome !== 'recorded') return;
  await forwardLead(provider, line, message);
}

async function forwardLead(
  provider: SmsProvider,
  line: LineRecord,
  message: InboundMessage,
): Promise<void> {
  // Until the owner proves the cell is theirs, replies stay in the list and are not texted out.
  if (!line.ownerCellVerified) {
    log.info('owner cell not verified, reply not forwarded', { line: line.id });
    return;
  }
  const ownerCell = normalizeUsPhone(line.ownerCell);
  if (!ownerCell || !isUsDomesticPhone(ownerCell)) {
    log.warn('owner cell is not a US number, reply not forwarded', { line: line.id });
    return;
  }
  const sent = await provider.sendText({
    to: ownerCell,
    from: line.providerNumber,
    body: leadText(message.from, message.body),
  });
  // The reply is saved either way; the owner still sees it in the list.
  if (!sent.ok) log.error('could not forward the lead', { line: line.id, code: sent.error.code });
}
