import { classifyKeyword, helpReply } from '@speedy/sms/keywords';

import { forwardText } from '@/features/replies/forward';

export interface PracticeReplyInput {
  customerName: string;
  customerPhone: string;
  /** What the owner typed while playing the customer. */
  body: string;
  businessName: string;
  /** The customer already has a STOP on the practice phone or on the owner's real list. */
  optedOut: boolean;
  /** A HELP answer already went to this customer in the last day. */
  helpAnsweredToday: boolean;
}

/** One bubble to add to the practice phone. Matches practice_messages. */
export type PracticeRow = {
  direction: 'out' | 'in' | 'forward';
  kind: 'text' | 'help' | 'note';
  body: string;
  status: 'sent' | 'replied' | 'received';
  error_code: null;
};

export interface PracticeReplyPlan {
  rows: PracticeRow[];
  /** The customer's rain-day text becomes "replied". */
  markReplied: boolean;
  /** A STOP or START to record on the practice phone (never in the real opt-outs). */
  optOut: 'stop' | 'start' | null;
}

const MAX_BODY = 1600;

const row = (
  direction: PracticeRow['direction'],
  kind: PracticeRow['kind'],
  body: string,
  status: PracticeRow['status'],
): PracticeRow => ({ direction, kind, body, status, error_code: null });

/**
 * What a reply typed on the practice phone does, with the same rules as production: STOP opts the
 * customer out; START, YES and UNSTOP opt them back in only when they are opted out (otherwise a
 * plain "Yes" is an ordinary reply); HELP gets the carrier line once a day; anything else is a
 * reply, forwarded to the owner's cell with the customer's name and number. Pure: it decides what
 * the phone shows and the server stores it.
 */
export function planPracticeReply(input: PracticeReplyInput): PracticeReplyPlan {
  const said = input.body.trim().slice(0, MAX_BODY);
  const incoming = row('in', 'text', said, 'received');
  const keyword = classifyKeyword(said);

  if (keyword === 'stop') {
    return {
      rows: [
        incoming,
        row('out', 'note', "Opted out. This customer won't get any more texts from you.", 'sent'),
      ],
      markReplied: false,
      optOut: 'stop',
    };
  }
  if (keyword === 'start' && input.optedOut) {
    return {
      rows: [
        incoming,
        row('out', 'note', 'Opted back in. This customer can get texts again.', 'sent'),
      ],
      markReplied: false,
      optOut: 'start',
    };
  }
  if (keyword === 'help') {
    const answer = input.helpAnsweredToday
      ? []
      : [row('out', 'help', helpReply(input.businessName), 'sent')];
    return { rows: [incoming, ...answer], markReplied: false, optOut: null };
  }
  return {
    rows: [
      incoming,
      row('forward', 'text', forwardText(input.customerName, input.customerPhone, said), 'sent'),
    ],
    markReplied: true,
    optOut: null,
  };
}
