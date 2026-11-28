import { z } from 'zod';

/**
 * Quiet hours decide whether a caller gets the regular text or the after-hours one. Stored on the
 * line as `{ "start": "17:00", "end": "08:00" }` in the line's timezone. `start` is inclusive,
 * `end` is exclusive and the window may wrap midnight. No quiet hours means every call is in hours.
 */
export const DEFAULT_TIMEZONE = 'America/New_York';

const hhmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);

export const quietHoursSchema = z
  .object({ start: hhmm, end: hhmm })
  .refine((v) => v.start !== v.end, { message: 'start and end must differ' });

export type QuietHours = z.infer<typeof quietHoursSchema>;

/** Anything stored that is not a valid window counts as "no quiet hours". */
export function parseQuietHours(value: unknown): QuietHours | null {
  const parsed = quietHoursSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toMinutes(hhmmValue: string): number {
  const [h, m] = hhmmValue.split(':');
  return Number(h) * 60 + Number(m);
}

function localMinutes(at: Date, timeZone: string): number {
  const read = (zone: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = read(timeZone);
  } catch {
    parts = read(DEFAULT_TIMEZONE);
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

export function isQuietNow(
  quietHours: QuietHours | null,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (!quietHours) return false;
  const start = toMinutes(quietHours.start);
  const end = toMinutes(quietHours.end);
  const minute = localMinutes(now, timeZone);
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
