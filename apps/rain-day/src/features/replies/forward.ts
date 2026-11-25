import { formatUsPhone } from '@speedy/lib/phone';

/** Forwards to the owner per hour, per owner. Enforced in rain_day.record_reply. */
export const FORWARD_CAP_PER_HOUR = 30;

const MAX_QUOTED = 320;

/** The text the owner gets on their cell: who replied, what they said, and their number. */
export function forwardText(customerName: string, customerPhone: string, body: string): string {
  const said = body.trim().replace(/\s+/g, ' ');
  const quoted = said.length > MAX_QUOTED ? `${said.slice(0, MAX_QUOTED - 1)}…` : said;
  return `${customerName} replied: "${quoted}" (${formatUsPhone(customerPhone)})`;
}
