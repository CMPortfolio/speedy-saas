/**
 * Service days. 0 = Sunday … 6 = Saturday, the same numbering as Date#getDay() and the
 * `service_day` column. Owners type days every way ("Tue", "tues", "Thursday"); parseWeekday
 * reads them all.
 */
export type ServiceDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Monday first, the order a work week reads in a select. */
export const SERVICE_DAY_OPTIONS: readonly { value: ServiceDay; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

/** Spellings that are not a prefix of the full name. */
const ALIASES: Record<string, ServiceDay> = {
  weds: 3,
  thur: 4,
  thurs: 4,
  tues: 2,
  tu: 2,
  th: 4,
  sa: 6,
  su: 0,
  m: 1,
  w: 3,
  f: 5,
};

export function isServiceDay(value: number): value is ServiceDay {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

/** "Tue", "Tuesday", "tues", "TUE." all give 2. Anything ambiguous or unknown gives null. */
export function parseWeekday(input: string): ServiceDay | null {
  const key = input.toLowerCase().replace(/[^a-z]/g, '');
  if (key === '') return null;
  const alias = ALIASES[key];
  if (alias !== undefined) return alias;
  if (key.length < 2) return null;
  const matches = WEEKDAYS.map((name, i) => (name.toLowerCase().startsWith(key) ? i : -1)).filter(
    (i) => i !== -1,
  );
  const only = matches.length === 1 ? matches[0] : undefined;
  return only !== undefined && isServiceDay(only) ? only : null;
}

export function weekdayName(day: number): string {
  return isServiceDay(day) ? WEEKDAYS[day] : '';
}
