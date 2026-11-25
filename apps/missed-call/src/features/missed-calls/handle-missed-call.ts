import { logger } from '@speedy/lib/logger';
import { isUsDomesticPhone, maskUsPhone } from '@speedy/lib/phone';
import type { CallStatusEvent, SmsProvider } from '@speedy/sms/provider';
import { sendFirstOrFollowup } from '@speedy/sms/send';
import { twimlHangup, twimlSay } from '@speedy/sms/twilio';

import { isQuietNow, parseQuietHours } from './quiet-hours';
import type { LineRecord, MissedCallStore } from './store';

const log = logger.child({ feature: 'missed-calls' });

/** Twilio waits 15 seconds for a webhook answer; give the provider at most this long. */
export const SEND_TIMEOUT_MS = 8_000;

export interface MissedCallDeps {
  provider: SmsProvider;
  store: MissedCallStore;
  now?: () => Date;
  sendTimeoutMs?: number;
}

/** The statuses that mean "the owner did not pick up". `ringing` is the first ring of a direct or forwarded call. */
const MISSED = new Set<CallStatusEvent['status']>(['ringing', 'no-answer', 'busy']);

function pickTemplate(line: LineRecord, now: Date): string {
  const quiet = isQuietNow(parseQuietHours(line.quietHours), line.timezone, now);
  return quiet && line.afterHoursTemplate ? line.afterHoursTemplate : line.template;
}

function greeting(businessName: string, texting: boolean): string {
  const hello = `Thanks for calling ${businessName}. Sorry we missed you.`;
  return texting
    ? `${hello} We are sending you a text right now.`
    : `${hello} Please try again soon.`;
}

type SendOutcome = 'sent' | 'failed' | 'unknown';

/**
 * Called from the voice webhook once the provider signature has been verified. Logs the missed
 * call, texts the caller the owner's template unless they were texted in the last 24 hours or are
 * blocked, and returns the TwiML to answer the call with. Returns undefined for events that are
 * not a missed inbound call (the route then answers 204).
 */
export async function handleMissedCall(
  deps: MissedCallDeps,
  event: CallStatusEvent,
): Promise<string | undefined> {
  if (event.direction !== 'inbound' || !MISSED.has(event.status)) return undefined;
  const { provider, store } = deps;
  const now = deps.now?.() ?? new Date();

  const line = await store.findLineByNumber(event.to);
  if (!line) {
    log.warn('call to a number with no line', { to: maskUsPhone(event.to) });
    return twimlHangup();
  }

  // Only US numbers are ever texted: the rest of the NANP (Canada, the Caribbean) is billed as
  // international and is where SMS-pumping fraud comes from. The call is still logged.
  const allowText = isUsDomesticPhone(event.from);
  const logged = await store.logMissedCall(line.id, event.from, event.callSid, allowText);
  log.info('missed call logged', {
    line: line.id,
    caller: maskUsPhone(event.from),
    outcome: logged.outcome,
  });
  if (logged.outcome === 'rate_limited') {
    log.warn('auto-text cap reached for line', { line: line.id });
  }
  if (logged.outcome !== 'send') return twimlSay(greeting(line.businessName, false));

  const body = pickTemplate(line, now);
  const sending = sendFirstOrFollowup(provider, store.optOuts(line.id), {
    to: event.from,
    from: line.providerNumber,
    body,
    businessName: line.businessName,
    isFirstContact: logged.firstContact,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), deps.sendTimeoutMs ?? SEND_TIMEOUT_MS);
  });
  const result = await Promise.race([sending, timeout]);
  clearTimeout(timer);

  let outcome: SendOutcome;
  if (result === 'timeout') {
    // The text may still go out. Keep the claim so a retry cannot text the caller twice.
    log.error('text send timed out', { line: line.id, caller: maskUsPhone(event.from) });
    outcome = 'unknown';
  } else if (result.ok) {
    outcome = 'sent';
    try {
      await store.recordTextSent(logged.callId, body, result.value.providerMessageId);
    } catch (e) {
      // The text is out; answering 500 would only make the provider retry a call we already handled.
      log.error('text sent but not recorded', { line: line.id, error: e });
    }
  } else {
    log.warn('auto-text not sent', { line: line.id, code: result.error.code });
    await store.releaseTextClaim(logged.callId);
    outcome = 'failed';
  }

  return twimlSay(greeting(line.businessName, outcome !== 'failed'));
}
