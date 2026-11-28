import type { QuietHours } from '../missed-calls/quiet-hours';

/**
 * The setup form asks when the owner is open; the line stores the quiet window (when callers get
 * the after-hours text). Open 08:00 to 17:00 is quiet from 17:00 to 08:00.
 */
export interface OpenHours {
  opens: string;
  closes: string;
}

export const DEFAULT_OPEN_HOURS: OpenHours = { opens: '08:00', closes: '17:00' };

export function toQuietHours(open: OpenHours): QuietHours {
  return { start: open.closes, end: open.opens };
}

export function toOpenHours(quiet: QuietHours | null): OpenHours | null {
  return quiet ? { opens: quiet.end, closes: quiet.start } : null;
}

/** "8:00 AM" from "08:00", for the preview and the summary. */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = h ?? 0;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(m ?? 0).padStart(2, '0')} ${suffix}`;
}
