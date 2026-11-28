import { formatUsPhone } from '@speedy/lib/phone';

import { DEFAULT_TIMEZONE } from '../missed-calls/quiet-hours';

export type CallStatus = 'missed' | 'texted' | 'replied' | 'called_back' | 'booked' | 'junk';

/** What the Missed calls list shows for one call. */
export interface CallRow {
  id: string;
  /** E.164, for the tel: and sms: links. */
  callerNumber: string;
  /** (239) 555-0123 */
  caller: string;
  receivedAt: string;
  /** "Wed, Jul 15, 10:04 AM" in the line's timezone. */
  received: string;
  /** The caller's latest reply, if any. */
  reply: string | null;
  status: CallStatus;
  statusLabel: string;
}

/** The shape PostgREST returns for the list query (calls with their line and messages embedded). */
export interface CallQueryRow {
  id: string;
  caller_number: string;
  received_at: string;
  status: CallStatus;
  lines: { timezone: string } | null;
  messages: { direction: 'in' | 'out'; body: string; created_at: string }[];
}

export const STATUS_LABELS: Record<CallStatus, string> = {
  missed: 'Missed',
  texted: 'Texted back',
  replied: 'Replied',
  called_back: 'Called back',
  booked: 'Booked',
  junk: 'Junk',
};

export function telHref(e164: string): string {
  return `tel:${e164}`;
}

export function smsHref(e164: string): string {
  return `sms:${e164}`;
}

export function formatReceived(iso: string, timeZone: string): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  try {
    return format(timeZone);
  } catch {
    return format(DEFAULT_TIMEZONE);
  }
}

/** Newest first, whatever order the rows arrive in. */
export function toCallRows(rows: CallQueryRow[]): CallRow[] {
  return [...rows]
    .sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at))
    .map((row) => {
      const latestReply = row.messages
        .filter((m) => m.direction === 'in')
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
      return {
        id: row.id,
        callerNumber: row.caller_number,
        caller: formatUsPhone(row.caller_number),
        receivedAt: row.received_at,
        received: formatReceived(row.received_at, row.lines?.timezone ?? DEFAULT_TIMEZONE),
        reply: latestReply?.body ?? null,
        status: row.status,
        statusLabel: STATUS_LABELS[row.status],
      };
    });
}
