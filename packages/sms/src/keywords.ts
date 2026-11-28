/**
 * STOP / START / HELP handling the carriers expect. Classification is case- and
 * whitespace-insensitive and ignores trailing punctuation ("Stop." opts out).
 * Opt-out state itself is stored by the tool (see `./send`'s `OptOutStore`).
 */
export type Keyword = 'stop' | 'start' | 'help' | 'message';

const STOP = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START = new Set(['START', 'YES', 'UNSTOP']);
const HELP = new Set(['HELP', 'INFO']);

export function classifyKeyword(body: string): Keyword {
  const word = body
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?,;:]+$/, '')
    .toUpperCase();
  if (STOP.has(word)) return 'stop';
  if (START.has(word)) return 'start';
  if (HELP.has(word)) return 'help';
  return 'message';
}

/** The reply to HELP or INFO, as the carriers want it worded. */
export function helpReply(businessName: string): string {
  return `${businessName}: reply STOP to opt out. Msg & data rates may apply.`;
}

const FOOTER_RE = /reply\s+stop\s+to\s+opt\s+out/i;

/**
 * Add the business name and the opt-out line to the FIRST text to a number. A body that already
 * carries the line is returned unchanged, so calling it twice is safe.
 */
export function withOptOutFooter(body: string, businessName: string): string {
  if (FOOTER_RE.test(body)) return body;
  return `${body.trimEnd()}\n${businessName}. Reply STOP to opt out.`;
}
