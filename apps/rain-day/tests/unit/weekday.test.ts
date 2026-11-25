import { describe, expect, it } from 'vitest';

import { parseWeekday, weekdayName } from '@/lib/weekday';

describe('parseWeekday', () => {
  it('reads full names, three-letter forms and common abbreviations', () => {
    expect(parseWeekday('Tuesday')).toBe(2);
    expect(parseWeekday('Tue')).toBe(2);
    expect(parseWeekday('tues')).toBe(2);
    expect(parseWeekday('TUE.')).toBe(2);
    expect(parseWeekday(' thurs ')).toBe(4);
    expect(parseWeekday('Thur')).toBe(4);
    expect(parseWeekday('weds')).toBe(3);
    expect(parseWeekday('Wednesday')).toBe(3);
    expect(parseWeekday('Mon')).toBe(1);
    expect(parseWeekday('Fri')).toBe(5);
    expect(parseWeekday('Saturday')).toBe(6);
    expect(parseWeekday('sun')).toBe(0);
  });

  it('accepts the unambiguous one- and two-letter forms', () => {
    expect(parseWeekday('M')).toBe(1);
    expect(parseWeekday('W')).toBe(3);
    expect(parseWeekday('F')).toBe(5);
    expect(parseWeekday('Tu')).toBe(2);
    expect(parseWeekday('Th')).toBe(4);
    expect(parseWeekday('Sa')).toBe(6);
    expect(parseWeekday('Su')).toBe(0);
  });

  it('returns null for ambiguous, empty or unknown input', () => {
    expect(parseWeekday('T')).toBeNull();
    expect(parseWeekday('S')).toBeNull();
    expect(parseWeekday('')).toBeNull();
    expect(parseWeekday('someday')).toBeNull();
    expect(parseWeekday('2')).toBeNull();
  });
});

describe('weekdayName', () => {
  it('names the seven days and nothing else', () => {
    expect(weekdayName(0)).toBe('Sunday');
    expect(weekdayName(6)).toBe('Saturday');
    expect(weekdayName(7)).toBe('');
    expect(weekdayName(-1)).toBe('');
  });
});
