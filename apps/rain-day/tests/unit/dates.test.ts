import { describe, expect, it } from 'vitest';

import { addDays, describeNewDay, isIsoDate, todayInNewYork, weekdayOf } from '@/lib/dates';

describe('dates', () => {
  it('reads today in New York, not UTC', () => {
    // 2026-11-25 02:30 UTC is still the evening of the 24th in New York.
    expect(todayInNewYork(new Date('2026-11-25T02:30:00Z'))).toBe('2026-11-24');
    expect(todayInNewYork(new Date('2026-11-25T15:00:00Z'))).toBe('2026-11-25');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('gives the weekday as 0 = Sunday', () => {
    expect(weekdayOf('2026-11-24')).toBe(2);
    expect(weekdayOf('2026-11-29')).toBe(0);
  });

  it('accepts only real calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('11/24/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('names the new day, with the date when it is more than a week out', () => {
    expect(describeNewDay('2026-11-25', '2026-11-24')).toBe('Wednesday');
    expect(describeNewDay('2026-11-30', '2026-11-24')).toBe('Monday');
    expect(describeNewDay('2026-12-02', '2026-11-24')).toBe('Wednesday, Dec 2');
  });
});
