import { describe, expect, it } from 'vitest';

import { sendInputSchema } from '@/features/rain-day/schema';

const valid = {
  idempotencyKey: '3f1d1c1e-8b0f-4b7e-9a57-0d8f5c7a1111',
  from: '2026-11-24',
  to: '2026-11-25',
  template: 'Hi {first_name}, moving you to {new_day}.',
  customerIds: ['3f1d1c1e-8b0f-4b7e-9a57-0d8f5c7a2222'],
};

describe('sendInputSchema', () => {
  it('accepts a good request', () => {
    expect(sendInputSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['no key', { idempotencyKey: 'abc' }],
    ['bad date', { from: '2026-13-01' }],
    ['same day', { to: '2026-11-24' }],
    ['empty message', { template: '   ' }],
    ['unknown placeholder', { template: 'Hi {name}' }],
    ['message too long', { template: 'x'.repeat(481) }],
    ['nobody ticked', { customerIds: [] }],
    ['not an id', { customerIds: ['nope'] }],
    ['too many', { customerIds: Array.from({ length: 501 }, () => valid.customerIds[0]) }],
  ])('rejects %s', (_label, patch) => {
    expect(sendInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
