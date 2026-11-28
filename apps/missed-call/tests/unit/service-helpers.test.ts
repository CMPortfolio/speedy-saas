import { describe, expect, it } from 'vitest';

import { serviceMissing, withService } from '../../src/features/missed-calls/store';

const SID = 'MG' + 'e'.repeat(32);

describe('withService', () => {
  it('adds the Messaging Service only when the line has one', () => {
    expect(withService({ messagingServiceSid: SID })).toEqual({ messagingServiceSid: SID });
    expect(withService({ messagingServiceSid: null })).toEqual({});
  });
});

describe('serviceMissing', () => {
  const none = { messagingServiceSid: null };
  const has = { messagingServiceSid: SID };

  it('is true only for a line without one on Twilio in production', () => {
    expect(serviceMissing(none, { name: 'twilio' }, 'production')).toBe(true);
    expect(serviceMissing(has, { name: 'twilio' }, 'production')).toBe(false);
    expect(serviceMissing(none, { name: 'fake' }, 'production')).toBe(false);
    expect(serviceMissing(none, { name: 'twilio' }, 'development')).toBe(false);
    expect(serviceMissing(none, { name: 'twilio' }, undefined)).toBe(false);
  });
});
