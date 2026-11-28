import { describe, expect, it } from 'vitest';

import { allowedPreviousStatuses, mapDeliveryStatus } from '@/features/rain-day/delivery';

describe('delivery status mapping', () => {
  it('maps provider statuses to message statuses', () => {
    expect(mapDeliveryStatus('queued')).toBeNull();
    expect(mapDeliveryStatus('sent')).toBe('sent');
    expect(mapDeliveryStatus('delivered')).toBe('delivered');
    expect(mapDeliveryStatus('failed')).toBe('failed');
    expect(mapDeliveryStatus('undelivered')).toBe('failed');
  });

  it('only moves forward: a late "sent" never undoes "delivered", and nothing undoes "replied"', () => {
    expect(allowedPreviousStatuses('sent')).toEqual(['queued']);
    expect(allowedPreviousStatuses('delivered')).toEqual(['queued', 'sent']);
    expect(allowedPreviousStatuses('failed')).toEqual(['queued', 'sent']);
  });
});
