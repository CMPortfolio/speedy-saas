import { describe, expect, it } from 'vitest';

import { firstName, formatUsPhone, isValidUsPhone, maskUsPhone, normalizeUsPhone } from './phone';

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
