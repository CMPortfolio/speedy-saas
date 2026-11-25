import { describe, expect, it } from 'vitest';

import {
  firstName,
  formatUsPhone,
  isUsDomesticPhone,
  isValidUsPhone,
  maskUsPhone,
  normalizeUsPhone,
} from './phone';
import { US_AREA_CODES } from './us-area-codes';

describe('US phone helpers', () => {
  it.each([
    ['(239) 555-0123', '+12395550123'],
    ['239-555-0123', '+12395550123'],
    ['239.555.0123', '+12395550123'],
    ['2395550123', '+12395550123'],
    ['1 239 555 0123', '+12395550123'],
    ['+1 (239) 555-0123', '+12395550123'],
    ['1-800-FLOWERS', '+18003569377'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeUsPhone(input)).toBe(expected);
    expect(isValidUsPhone(input)).toBe(true);
  });

  it.each([
    '',
    '555-0123',
    '(039) 555-0123',
    '(291) 555-0123',
    '(239) 911-0123',
    '(239) 155-0123',
    '+44 20 7946 0958',
    '12345678901234',
  ])('rejects %s', (input) => {
    expect(normalizeUsPhone(input)).toBeNull();
    expect(isValidUsPhone(input)).toBe(false);
  });

  it('formats for display and leaves junk alone', () => {
    expect(formatUsPhone('+12395550123')).toBe('(239) 555-0123');
    expect(formatUsPhone('not a phone')).toBe('not a phone');
  });

  it('masks all but the last four', () => {
    expect(maskUsPhone('+12395550123')).toBe('•••• 0123');
    expect(maskUsPhone('x')).toBe('••••');
  });

  it('firstName takes the first word', () => {
    expect(firstName('  Maria Lopez ')).toBe('Maria');
    expect(firstName('')).toBe('');
  });
});

describe('isUsDomesticPhone', () => {
  it.each([
    ['+12395550123', 'Naples FL'],
    ['(941) 555-0123', 'Sarasota FL'],
    ['305-555-0123', 'Miami FL'],
    ['+12125550123', 'New York'],
    ['+12025550123', 'Washington DC'],
    ['+19075550123', 'Alaska'],
    ['+18085550123', 'Hawaii'],
  ])('accepts %s (%s)', (input) => {
    expect(isUsDomesticPhone(input)).toBe(true);
  });

  it.each([
    ['+14165550123', 'Toronto'],
    ['+16045550123', 'Vancouver'],
    ['+15145550123', 'Montreal'],
    ['+12425550123', 'Bahamas'],
    ['+12465550123', 'Barbados'],
    ['+18765550123', 'Jamaica'],
    ['+18095550123', 'Dominican Republic'],
    ['+17875550123', 'Puerto Rico'],
    ['+19395550123', 'Puerto Rico'],
    ['+13405550123', 'US Virgin Islands'],
    ['+16715550123', 'Guam'],
    ['+16705550123', 'Northern Mariana Islands'],
    ['+16845550123', 'American Samoa'],
    ['+18665550123', 'toll free'],
    ['+19005550123', 'premium rate'],
    ['+15005550123', 'personal numbers'],
    ['+442079460958', 'UK'],
    ['not a phone', 'junk'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input) => {
    expect(isUsDomesticPhone(input)).toBe(false);
  });

  it('still lets normalizeUsPhone accept every NANP number', () => {
    expect(normalizeUsPhone('+14165550123')).toBe('+14165550123');
    expect(normalizeUsPhone('+17875550123')).toBe('+17875550123');
  });

  it('keeps the allowlist clear of every Canadian and Caribbean code', () => {
    const notUs = [
      204, 226, 236, 249, 250, 257, 263, 289, 306, 343, 354, 365, 367, 368, 382, 403, 416, 418, 428,
      431, 437, 438, 450, 468, 474, 506, 514, 519, 548, 579, 581, 584, 587, 604, 613, 639, 647, 672,
      683, 705, 709, 742, 753, 778, 780, 782, 807, 819, 825, 867, 873, 879, 902, 905, 942, 242, 246,
      264, 268, 284, 340, 345, 441, 473, 649, 658, 664, 670, 671, 684, 721, 758, 767, 784, 787, 809,
      829, 849, 868, 869, 876, 939,
    ];
    expect(notUs.filter((c) => US_AREA_CODES.has(String(c)))).toEqual([]);
  });

  it('only holds well-formed geographic codes', () => {
    for (const code of US_AREA_CODES) {
      expect(code).toMatch(/^[2-9][0-8][0-9]$/);
    }
    expect(US_AREA_CODES.size).toBeGreaterThan(300);
  });
});
