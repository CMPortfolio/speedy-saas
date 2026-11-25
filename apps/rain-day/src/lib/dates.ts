/**
 * Calendar dates as 'YYYY-MM-DD' strings, so a day never shifts with the server's timezone.
 * "Today" is always read in America/New_York, where the owners are.
 */
export const TIME_ZONE = 'America/New_York';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function isIsoDate(value: string): boolean {
  const match = ISO.exec(value);
  if (!match) return false;
  return toUtc(value).toISOString().slice(0, 10) === value;
}

/** Today's date in New York. */
export function todayInNewYork(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, matching the customers' service_day. */
export function weekdayOf(iso: string): number {
  return toUtc(iso).getUTCDay();
}

const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * How the new day reads in the text: "Wednesday" within the coming week, otherwise
 * "Wednesday, Dec 2" so nobody has to guess which one.
 */
export function describeNewDay(toIso: string, todayIso: string): string {
  const name = NAMES[weekdayOf(toIso)] ?? '';
  const diff = Math.round((toUtc(toIso).getTime() - toUtc(todayIso).getTime()) / 86_400_000);
  if (diff >= 0 && diff <= 6) return name;
  const date = toUtc(toIso);
  return `${name}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
