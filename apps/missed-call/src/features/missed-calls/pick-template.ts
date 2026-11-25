import { isQuietNow, parseQuietHours } from './quiet-hours';

/** What picking the text needs from a line: its two texts, its quiet hours and its timezone. */
export interface TemplateSource {
  template: string;
  afterHoursTemplate: string | null;
  quietHours: unknown;
  timezone: string;
}

/**
 * The text a caller gets: the after-hours one inside the line's quiet hours (America/New_York unless
 * the line says otherwise), otherwise the regular one. Shared by the real flow and practice mode.
 */
export function pickTemplate(line: TemplateSource, now: Date): string {
  const quiet = isQuietNow(parseQuietHours(line.quietHours), line.timezone, now);
  return quiet && line.afterHoursTemplate ? line.afterHoursTemplate : line.template;
}
