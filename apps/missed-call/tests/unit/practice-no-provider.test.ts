import { describe, expect, it, vi } from 'vitest';

// Loading anything the practice flow depends on must never load the Twilio SDK or the real
// provider setup. If it did, importing it would throw.
vi.mock('twilio', () => {
  throw new Error('the Twilio SDK was loaded');
});
vi.mock('@/config/sms', () => {
  throw new Error('the real SMS provider setup was loaded');
});
vi.mock('@speedy/sms/twilio', () => {
  throw new Error('the Twilio adapter was loaded');
});
vi.mock('@speedy/sms/create', () => {
  throw new Error('the provider factory was loaded');
});

describe('the practice code', () => {
  it('loads without the Twilio SDK, the Twilio adapter, the provider factory or @/config/sms', async () => {
    const flow = await import('../../src/features/practice/practice-flow');
    await import('../../src/features/practice/practice-guard');
    await import('../../src/features/practice/practice-store');
    await import('../../src/features/practice/practice-mode');
    expect(typeof flow.simulateMissedCall).toBe('function');
  });
});
