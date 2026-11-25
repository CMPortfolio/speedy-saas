import { describe, expect, it } from 'vitest';

import { DEFAULT_TIMEZONE, isQuietNow, parseQuietHours } from './quiet-hours';

// 2026-07-15 is a Wednesday in EDT (UTC-4); 2026-01-14 is a Wednesday in EST (UTC-5).
const at = (iso: string) => new Date(iso);
const overnight = { start: '17:00', end: '08:00' };

describe('parseQuietHours', () => {
  it('accepts start and end as HH:MM', () => {
    expect(parseQuietHours({ start: '17:00', end: '08:30' })).toEqual({
      start: '17:00',
      end: '08:30',
    });
  });

  it.each([
    null,
    undefined,
    'night',
    {},
    { start: '17:00' },
    { start: '25:00', end: '08:00' },
    { start: '17:60', end: '08:00' },
    { start: '8am', end: '5pm' },
    { start: '08:00', end: '08:00' },
  ])('treats %j as no quiet hours', (value) => {
    expect(parseQuietHours(value)).toBeNull();
  });
});

describe('isQuietNow', () => {
  it('is never quiet without quiet hours', () => {
    expect(isQuietNow(null, DEFAULT_TIMEZONE, at('2026-07-15T03:00:00Z'))).toBe(false);
  });

  it('uses the line timezone, America/New_York by default', () => {
    // 21:00Z in July is 17:00 in New York: the start edge is quiet.
    expect(isQuietNow(overnight, DEFAULT_TIMEZONE, at('2026-07-15T21:00:00Z'))).toBe(true);
    // The same instant is 14:00 in Phoenix (UTC-7, no DST): not quiet.
    expect(isQuietNow(overnight, 'America/Phoenix', at('2026-07-15T21:00:00Z'))).toBe(false);
  });

  it('start is inclusive and end is exclusive for a window that wraps midnight', () => {
    expect(isQuietNow(overnight, DEFAULT_TIMEZONE, at('2026-07-15T20:59:59Z'))).toBe(false); // 16:59:59
    expect(isQuietNow(overnight, DEFAULT_TIMEZONE, at('2026-07-15T21:00:00Z'))).toBe(true); // 17:00
    expect(isQuietNow(overnight, DEFAULT_TIMEZONE, at('2026-07-16T03:59:00Z'))).toBe(true); // 23:59
    expect(isQuietNow(overnight, DEFAULT_TIMEZONE, at('2026-07-16T04:00:00Z'))).toBe(true); // 00:00
    expect(isQuietNow(overnight, DEFAULT_TIMEZONE, at('2026-07-16T11:59:59Z'))).toBe(true); // 07:59:59
    expect(isQuietNow(overnight, DEFAULT_TIMEZONE, at('2026-07-16T12:00:00Z'))).toBe(false); // 08:00
  });

  it('handles a window inside one day', () => {
    const lunch = { start: '12:00', end: '13:00' };
    expect(isQuietNow(lunch, DEFAULT_TIMEZONE, at('2026-07-15T15:59:59Z'))).toBe(false); // 11:59:59
    expect(isQuietNow(lunch, DEFAULT_TIMEZONE, at('2026-07-15T16:00:00Z'))).toBe(true); // 12:00
    expect(isQuietNow(lunch, DEFAULT_TIMEZONE, at('2026-07-15T16:59:59Z'))).toBe(true); // 12:59:59
    expect(isQuietNow(lunch, DEFAULT_TIMEZONE, at('2026-07-15T17:00:00Z'))).toBe(false); // 13:00
  });

  it('follows daylight saving: 17:00 is 22:00Z in winter, 21:00Z in summer', () => {
    expect(isQuietNow(overnight, DEFAULT_TIMEZONE, at('2026-01-14T21:59:59Z'))).toBe(false);
    expect(isQuietNow(overnight, DEFAULT_TIMEZONE, at('2026-01-14T22:00:00Z'))).toBe(true);
  });

  it('falls back to America/New_York for an unknown timezone', () => {
    expect(isQuietNow(overnight, 'Not/AZone', at('2026-07-15T21:00:00Z'))).toBe(true);
    expect(isQuietNow(overnight, 'Not/AZone', at('2026-07-15T20:59:59Z'))).toBe(false);
  });
});
