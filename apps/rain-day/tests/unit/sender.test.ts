import { describe, expect, it } from 'vitest';

import { resolveSender, serviceOf } from '@/features/settings/sender';

const NUMBER = '+12395550100';
const SID = 'MG0123456789abcdef0123456789abcdef';

describe('resolveSender', () => {
  it('gives the number and the owner’s Messaging Service, both of which every send passes', () => {
    const sender = resolveSender(
      { sender_number: NUMBER, sender_messaging_service_sid: SID },
      'twilio',
    );
    expect(sender).toEqual({ from: NUMBER, messagingServiceSid: SID });
    expect(serviceOf(sender!)).toEqual({ messagingServiceSid: SID });
  });

  it('is not ready without a number, whatever the provider', () => {
    expect(resolveSender(null, 'twilio')).toBeNull();
    expect(
      resolveSender({ sender_number: null, sender_messaging_service_sid: SID }, 'twilio'),
    ).toBeNull();
    expect(
      resolveSender({ sender_number: null, sender_messaging_service_sid: null }, 'fake'),
    ).toBeNull();
  });

  it('with the real provider an owner without a Messaging Service is not ready', () => {
    expect(
      resolveSender({ sender_number: NUMBER, sender_messaging_service_sid: null }, 'twilio'),
    ).toBeNull();
  });

  it('the fake provider does not need a Messaging Service, and passes one if there is one', () => {
    const bare = resolveSender(
      { sender_number: NUMBER, sender_messaging_service_sid: null },
      'fake',
    );
    expect(bare).toEqual({ from: NUMBER });
    expect(serviceOf(bare!)).toEqual({});
    expect(
      resolveSender({ sender_number: NUMBER, sender_messaging_service_sid: SID }, 'fake'),
    ).toEqual({ from: NUMBER, messagingServiceSid: SID });
  });
});
