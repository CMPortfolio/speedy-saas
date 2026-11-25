import { describe, expect, it } from 'vitest';

import { lineNumberReady, practiceModeFor } from '../../src/features/practice/practice-mode';

const SID = 'MG' + 'a'.repeat(32);
const none = { providerNumber: null, messagingServiceSid: null };
const numberOnly = { providerNumber: '+12395550142', messagingServiceSid: null };
const both = { providerNumber: '+12395550142', messagingServiceSid: SID };

describe('practiceModeFor', () => {
  it('is off before the owner has saved a line', () => {
    expect(practiceModeFor(null)).toBe(false);
  });

  it('is on for a saved line with no number', () => {
    expect(practiceModeFor(none)).toBe(true);
  });

  it('is off as soon as the line has any number, even before its Messaging Service is set', () => {
    expect(practiceModeFor(numberOnly)).toBe(false);
    expect(practiceModeFor(both)).toBe(false);
  });

  it('reads only the number: no provider, environment or Messaging Service can turn it on', () => {
    expect(practiceModeFor.length).toBe(1);
    for (const sid of [null, SID]) {
      expect(
        practiceModeFor({ providerNumber: '+12395550142', messagingServiceSid: sid } as never),
      ).toBe(false);
    }
  });
});

describe('lineNumberReady (the setup page)', () => {
  it('needs the number, and on Twilio in production the Messaging Service too', () => {
    expect(lineNumberReady(none, 'twilio', 'production')).toBe(false);
    expect(lineNumberReady(numberOnly, 'twilio', 'production')).toBe(false);
    expect(lineNumberReady(both, 'twilio', 'production')).toBe(true);
    expect(lineNumberReady(numberOnly, 'fake', 'production')).toBe(true);
    expect(lineNumberReady(numberOnly, 'twilio', 'development')).toBe(true);
  });
});
