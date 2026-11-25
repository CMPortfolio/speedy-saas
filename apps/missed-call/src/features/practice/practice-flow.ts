import { formatUsPhone, type E164 } from '@speedy/lib/phone';
import { classifyKeyword, helpReply } from '@speedy/sms/keywords';
import { practiceProvider, type PracticeSink } from '@speedy/sms/practice';
import { sendFirstOrFollowup, type OptOutStore } from '@speedy/sms/send';

import { pickTemplate } from '../missed-calls/pick-template';
import { leadText } from '../missed-calls/handle-reply';
import { PRACTICE_LINE_NUMBER, isPracticeCaller, isUuid, nextPracticeCaller } from './numbers';
import type {
  PracticeCall,
  PracticeDirection,
  PracticeStatus,
  PracticeStore,
} from './practice-store';

/**
 * Practice mode for missed-call: the same rules as the real flow (the owner's template and
 * after-hours template, the 24 hour cooldown, Junk, STOP, START, HELP, the "New lead from" text), run
 * against the practice tables and shown on an on-screen phone. It never touches the real calls,
 * messages or blocked numbers, and it never touches a provider: texts go through the practice
 * provider into the owner's practice rows. Nothing here imports the real SMS provider or its config.
 */
export interface PracticeLine {
  businessName: string;
  template: string;
  afterHoursTemplate: string | null;
  quietHours: unknown;
  timezone: string;
  /** Shown as "Your cell" on the screen. Nothing is ever sent to it. */
  ownerCell: string;
}

export interface PracticeDeps {
  store: PracticeStore;
  line: PracticeLine;
  now?: () => Date;
}

export type PracticeResult =
  | { ok: true; note: string }
  | {
      ok: false;
      code: 'bad_input' | 'rate_limited' | 'full' | 'not_found' | 'ignored';
      message: string;
    };

const DAY = 24 * 3600_000;
export const MAX_PRACTICE_REPLY = 320;

const fail = (
  code: Extract<PracticeResult, { ok: false }>['code'],
  message: string,
): PracticeResult => ({
  ok: false,
  code,
  message,
});
const done = (note: string): PracticeResult => ({ ok: true, note });

async function reserve(store: PracticeStore): Promise<PracticeResult | null> {
  const r = await store.reserve();
  if (r === 'rate_limited') {
    return fail(
      'rate_limited',
      'That is a lot of practice for one hour. Try again a little later.',
    );
  }
  if (r === 'full') {
    return fail('full', 'Practice is full. Tap Clear practice to start fresh.');
  }
  return null;
}

/**
 * A practice text lands on the screen in the direction it is given: `out` is a text the caller
 * receives. The owner's cell is display-only, so nothing here is ever addressed to it.
 */
function practiceSink(
  deps: PracticeDeps,
  callId: string,
  direction: PracticeDirection,
): PracticeSink {
  return {
    async add(message) {
      return deps.store.addMessage(callId, direction, message.body);
    },
  };
}

const NOT_A_CALL = 'That is not one of your practice calls.';
const GONE = 'That practice call is gone. Tap Clear practice and try again.';

/** Practice has no opt-out list of its own to consult at send time: STOP and Junk are checked first. */
const nothingBlocked: OptOutStore = {
  async isOptedOut() {
    return false;
  },
  async setOptedOut() {
    return undefined;
  },
};

function holdReason(prior: PracticeCall[], now: Date): string | null {
  if (prior.some((c) => c.status === 'junk')) {
    return 'This number is marked Junk, so it gets no text.';
  }
  if (prior.some((c) => c.optedOut)) {
    return 'This number replied STOP, so it gets no text.';
  }
  const recent = prior.some((c) => c.textedAt && now.getTime() - Date.parse(c.textedAt) < DAY);
  return recent
    ? 'This number was already texted in the last 24 hours, so it gets no second text.'
    : null;
}

/** A pretend missed call from the next unused practice number, chosen here and not by the request. */
export async function simulateNewCall(deps: PracticeDeps): Promise<PracticeResult> {
  return simulateMissedCall(deps, nextPracticeCaller(await deps.store.callers()));
}

/** The same practice caller again, found by id among this owner's own calls (to try the 24 hour rule). */
export async function simulateRepeatCall(
  deps: PracticeDeps,
  callId: string,
): Promise<PracticeResult> {
  if (!isUuid(callId)) return fail('bad_input', NOT_A_CALL);
  const call = await deps.store.getCall(callId);
  if (!call) return fail('not_found', GONE);
  return simulateMissedCall(deps, call.callerNumber);
}

/** A pretend missed call from a practice caller: logged, and texted back unless the real rules say no. */
export async function simulateMissedCall(
  deps: PracticeDeps,
  caller: string,
): Promise<PracticeResult> {
  if (!isPracticeCaller(caller))
    return fail('bad_input', 'Practice callers are (239) 555-0101 to 0199.');
  const blocked = await reserve(deps.store);
  if (blocked) return blocked;

  const now = deps.now?.() ?? new Date();
  const prior = await deps.store.callsFor(caller);
  const callId = await deps.store.addCall(caller, now);
  const label = formatUsPhone(caller);
  const why = holdReason(prior, now);
  if (why) return done(`Missed call from ${label} logged. ${why}`);

  const sent = await sendFirstOrFollowup(
    practiceProvider(practiceSink(deps, callId, 'out')),
    nothingBlocked,
    {
      to: caller,
      from: PRACTICE_LINE_NUMBER,
      body: pickTemplate(deps.line, now),
      businessName: deps.line.businessName,
      isFirstContact: !prior.some((c) => c.textedAt),
    },
  );
  if (!sent.ok) return fail('bad_input', 'The practice text could not be shown. Try again.');
  await deps.store.markTexted(callId, now);
  return done(`Missed call from ${label} logged. The caller got your text.`);
}

/** The practice caller types a reply: a lead, or STOP, START or HELP, handled like the real flow. */
export async function sendPracticeReply(
  deps: PracticeDeps,
  callId: string,
  rawBody: string,
): Promise<PracticeResult> {
  const body = rawBody.trim();
  if (!body) return fail('bad_input', 'Type what the caller says first.');
  if (body.length > MAX_PRACTICE_REPLY) {
    return fail('bad_input', `Keep it under ${MAX_PRACTICE_REPLY} characters.`);
  }
  if (!isUuid(callId)) return fail('bad_input', NOT_A_CALL);
  const blocked = await reserve(deps.store);
  if (blocked) return blocked;

  const call = await deps.store.getCall(callId);
  if (!call) return fail('not_found', GONE);
  const prior = await deps.store.callsFor(call.callerNumber);
  if (prior.some((c) => c.status === 'junk')) {
    return fail('ignored', 'This number is marked Junk, so its texts are ignored.');
  }
  return handleKeywordOrLead(deps, call, prior, body);
}

/**
 * STOP, START and HELP are handled like the real flow, and like the real flow they are not kept as
 * replies. Anything else, including a plain "Yes", is a reply and a lead.
 */
async function handleKeywordOrLead(
  deps: PracticeDeps,
  call: PracticeCall,
  prior: PracticeCall[],
  body: string,
): Promise<PracticeResult> {
  const keyword = classifyKeyword(body);
  if (keyword === 'stop') {
    await deps.store.setOptedOut(call.callerNumber, true);
    return done('STOP recorded. This number gets no more texts, and nothing is passed to you.');
  }
  if (keyword === 'start' && call.optedOut) {
    await deps.store.setOptedOut(call.callerNumber, false);
    return done('START recorded. This number can get texts again.');
  }
  if (keyword === 'help') return answerHelp(deps, call, prior);

  await deps.store.addMessage(call.id, 'in', body);
  if (call.status === 'missed' || call.status === 'texted') {
    await deps.store.setStatus(call.id, 'replied');
  }
  // "Your cell" is only a view of the lead. It is saved for the screen, never texted to owner_cell.
  await deps.store.addMessage(call.id, 'forward', leadText(call.callerNumber, body));
  return done('Your cell got the lead.');
}

/** HELP gets the standard answer once a day per practice caller, as in the real flow. */
async function answerHelp(
  deps: PracticeDeps,
  call: PracticeCall,
  prior: PracticeCall[],
): Promise<PracticeResult> {
  const now = deps.now?.() ?? new Date();
  const answeredToday = prior.some(
    (c) => c.helpAnsweredAt && now.getTime() - Date.parse(c.helpAnsweredAt) < DAY,
  );
  if (answeredToday) return done('HELP was already answered for this number in the last 24 hours.');
  await practiceProvider(practiceSink(deps, call.id, 'out')).sendText({
    to: call.callerNumber as E164,
    from: PRACTICE_LINE_NUMBER,
    body: helpReply(deps.line.businessName),
  });
  await deps.store.markHelpAnswered(call.id, now);
  return done('HELP answered on the caller phone.');
}

/** Called back, Booked or Junk on a practice call. Junk stops practice texts to that number. */
export async function markPracticeCall(
  deps: PracticeDeps,
  callId: string,
  status: Extract<PracticeStatus, 'called_back' | 'booked' | 'junk'>,
): Promise<PracticeResult> {
  if (!['called_back', 'booked', 'junk'].includes(status)) {
    return fail('bad_input', 'Pick Called back, Booked or Junk.');
  }
  if (!isUuid(callId)) return fail('bad_input', NOT_A_CALL);
  const blocked = await reserve(deps.store);
  if (blocked) return blocked;
  const call = await deps.store.getCall(callId);
  if (!call) return fail('not_found', GONE);
  await deps.store.setStatus(callId, status);
  return done('Saved.');
}

/** Delete all practice data for this owner. Never limited, so it can always free up a full practice. */
export async function clearPractice(deps: PracticeDeps): Promise<PracticeResult> {
  await deps.store.clear();
  return done('Practice cleared.');
}
