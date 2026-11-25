import { logger } from '@speedy/lib/logger';
import { isUsDomesticPhone, maskUsPhone } from '@speedy/lib/phone';
import type { CallStatusEvent, SmsProvider } from '@speedy/sms/provider';
import { withOptOutFooter } from '@speedy/sms/keywords';
import { sendFirstOrFollowup } from '@speedy/sms/send';
import { twimlHangup, twimlSay } from '@speedy/sms/twilio';

import { isQuietNow, parseQuietHours } from './quiet-hours';
import {
  serviceMissing,
  withService,
  type LineRecord,
  type LogResult,
  type MissedCallStore,
} from './store';

const log = logger.child({ feature: 'missed-calls' });

/** Twilio waits 15 seconds for a webhook answer; give the provider at most this long. */
export const SEND_TIMEOUT_MS = 8_000;

export interface MissedCallDeps {
  provider: SmsProvider;
  store: MissedCallStore;
  now?: () => Date;
  sendTimeoutMs?: number;
  /**
   * Keep a task alive after the response has gone out (Next's `after()`). Used to record a text
   * that finished after the send timeout.
   */
  defer?: (task: Promise<unknown>) => void;
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

/** Text the caller from the line's number, through the line's own Messaging Service when it has one. */
function sendTemplate(
  deps: MissedCallDeps,
  line: LineRecord,
  text: { to: CallStatusEvent['from']; body: string; isFirstContact: boolean },
) {
  return sendFirstOrFollowup(deps.provider, deps.store.optOuts(line.id), {
    ...text,
    from: line.providerNumber,
    businessName: line.businessName,
    ...withService(line),
  });
}

function noteOutcome(line: LineRecord, logged: LogResult, caller: CallStatusEvent['from']): void {
  log.info('missed call logged', {
    line: line.id,
    caller: maskUsPhone(caller),
    outcome: logged.outcome,
  });
  if (logged.outcome === 'rate_limited') {
    log.warn('auto-text cap reached for line', { line: line.id });
  }
}

/**
 * Decides whether a logged call is texted. A line with no Messaging Service is not ready on the real
 * provider in production: nothing is sent, and the cooldown claim is given back so the first call
 * after the admin finishes setup is still texted. Returns true when the send was held.
 */
async function holdSend(
  deps: MissedCallDeps,
  line: LineRecord,
  logged: LogResult,
  caller: CallStatusEvent['from'],
): Promise<boolean> {
  if (logged.outcome !== 'send' || !serviceMissing(line, deps.provider)) return false;
  log.warn('line has no messaging service', { line: line.id, caller: maskUsPhone(caller) });
  try {
    await deps.store.releaseTextClaim(logged.callId);
  } catch (e) {
    log.error('could not release the text claim', { line: line.id, error: e });
  }
  return true;
}

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
  const { store } = deps;
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
  noteOutcome(line, logged, event.from);
  if (await holdSend(deps, line, logged, event.from)) {
    return twimlSay(greeting(line.businessName, false));
  }
  // A retried webhook hears what the first one did: it said a text was on its way only if one was.
  if (logged.outcome === 'duplicate') {
    return twimlSay(greeting(line.businessName, !serviceMissing(line, deps.provider)));
  }
  if (logged.outcome !== 'send') return twimlSay(greeting(line.businessName, false));

  const body = pickTemplate(line, now);
  // What the caller actually receives: the first text to a number also carries the opt-out line.
  const sentBody = logged.firstContact ? withOptOutFooter(body, line.businessName) : body;
  const sending = sendTemplate(deps, line, {
    to: event.from,
    body,
    isFirstContact: logged.firstContact,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), deps.sendTimeoutMs ?? SEND_TIMEOUT_MS);
  });
  const result = await Promise.race([sending, timeout]);
  clearTimeout(timer);

  const settle = async (res: Awaited<typeof sending>): Promise<boolean> => {
    if (res.ok) {
      try {
        await store.recordTextSent(logged.callId, sentBody, res.value.providerMessageId);
      } catch (e) {
        // The text is out; failing the webhook would only make the provider retry a handled call.
        log.error('text sent but not recorded', { line: line.id, error: e });
      }
      return true;
    }
    log.warn('auto-text not sent', { line: line.id, code: res.error.code });
    try {
      await store.releaseTextClaim(logged.callId);
    } catch (e) {
      log.error('could not release the text claim', { line: line.id, error: e });
    }
    return false;
  };

  let texting: boolean;
  if (result === 'timeout') {
    // The text may still go out. Keep the claim so a retry cannot text the caller twice, and
    // record or release it when the provider finally answers.
    log.error('text send timed out', { line: line.id, caller: maskUsPhone(event.from) });
    const late = sending.then(settle, (e: unknown) => {
      log.error('late text send threw', { line: line.id, error: e });
      return false;
    });
    deps.defer?.(late);
    texting = true;
  } else {
    texting = await settle(result);
  }

  return twimlSay(greeting(line.businessName, texting));
}
