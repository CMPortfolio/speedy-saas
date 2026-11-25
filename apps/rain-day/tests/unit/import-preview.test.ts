import { normalizeUsPhone } from '@speedy/lib/phone';
import { previewImport } from '@speedy/ui/csv';
import { describe, expect, it } from 'vitest';

import { parseWeekday } from '@/lib/weekday';

/** The real rules the import page uses: US phones to E.164, days in any spelling. */
const validators = {
  phone: normalizeUsPhone,
  day: parseWeekday,
  existingPhones: new Set(['+12395550199' as const]),
};

describe('import preview with the rain-day rules', () => {
  it('reads a pasted list with mixed separators and day spellings', () => {
    const text = [
      'Maria Lopez, 239-555-0123, Tuesday, back gate',
      'Jim Hale, (239) 555-0188, tues',
      'Pat Ruiz, +1 239 555 0177, Thurs',
    ].join('\n');
    const { accepted, skipped } = previewImport(text, validators);
    expect(skipped).toEqual([]);
    expect(accepted.map((r) => [r.name, r.phone, r.day, r.note])).toEqual([
      ['Maria Lopez', '+12395550123', 2, 'back gate'],
      ['Jim Hale', '+12395550188', 2, null],
      ['Pat Ruiz', '+12395550177', 4, null],
    ]);
  });

  it('skips bad phones, duplicates, numbers already in the list and missing days, with reasons', () => {
    const text = [
      'Customer\tCell\tService day\tNote',
      'Maria Lopez\t239-555-0123\tTue\t',
      'Bad Number\t555-0123\tTue\t',
      'Maria Twice\t2395550123\tWed\t',
      'Already Here\t239-555-0199\tWed\t',
      'No Day\t239-555-0166\t\t',
      'Odd Day\t239-555-0155\tsomeday\t',
    ].join('\n');
    const { hasHeader, accepted, skipped } = previewImport(text, validators);
    expect(hasHeader).toBe(true);
    expect(accepted.map((r) => r.name)).toEqual(['Maria Lopez']);
    expect(skipped.map((r) => `${r.line}: ${r.reason}`)).toEqual([
      '3: Bad phone number',
      '4: Same number appears above',
      '5: Already in your list',
      '6: No service day',
      '7: Unknown day',
    ]);
  });
});
