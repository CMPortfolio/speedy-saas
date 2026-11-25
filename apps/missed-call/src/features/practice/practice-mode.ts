import { serviceMissing } from '../missed-calls/store';

/** The two things that decide whether a line can send for real. Both are the owner's own server-side state. */
export interface LineNumberState {
  providerNumber: string | null;
  messagingServiceSid: string | null;
}

/**
 * True once an admin has given the line a real number and, on the real provider in production, its
 * Messaging Service too. This is the one definition of "set up" the setup page and practice share.
 */
export function lineNumberReady(
  line: LineNumberState,
  smsProvider: string,
  nodeEnv: string | undefined,
): boolean {
  return Boolean(line.providerNumber) && !serviceMissing(line, { name: smsProvider }, nodeEnv);
}

/**
 * Practice mode is on for an owner who has saved a line that has no number at all, and off the
 * moment it has one, even before its Messaging Service is set: a line with a number is a real line
 * that is waiting to be finished, not a practice line. It is decided here, on the server, from the
 * line in the database. Nothing the browser sends can turn it on.
 */
export function practiceModeFor(line: Pick<LineNumberState, 'providerNumber'> | null): boolean {
  return line !== null && line.providerNumber === null;
}
