import { describe, expect, it } from 'vitest';

import { customerFormSchema, importRowsSchema } from '@/features/customers/schema';

const base = { name: 'Maria Lopez', service_day: '2', note: '' };

describe('customer phone numbers', () => {
  it('accepts a US number in any spelling and stores it as E.164', () => {
    const parsed = customerFormSchema.safeParse({ ...base, phone: '(239) 555-0123' });
    expect(parsed.success && parsed.data.phone).toBe('+12395550123');
  });

  it.each([
    ['Toronto', '416-555-0123'],
    ['Jamaica', '876-555-0123'],
    ['Puerto Rico', '787-555-0123'],
  ])('rejects a non-US number (%s) when adding a customer', (_label, phone) => {
    const parsed = customerFormSchema.safeParse({ ...base, phone });
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues[0]?.message).toBe(
      'Rain Day texts US numbers only.',
    );
  });

  it('rejects a non-US number in an import, however it is spelled', () => {
    const parsed = importRowsSchema.safeParse([
      { name: 'Eh', phone: '+1 (416) 555-0123', service_day: 2, note: null },
    ]);
    expect(parsed.success).toBe(false);
  });
});
