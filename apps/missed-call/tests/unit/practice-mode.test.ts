import { describe, expect, it } from 'vitest';

import { lineNumberReady, practiceModeFor } from '../../src/features/practice/practice-mode';

const SID = 'MG' + 'a'.repeat(32);
const none = { providerNumber: null, messagingServiceSid: null };
const numberOnly = { providerNumber: '+12395550142', messagingServiceSid: null };
const both = { providerNumber: '+12395550142', messagingServiceSid: SID };

describe('practiceModeFor', () => {
  it('is off before the owner has saved a line', () => {
    expect(practiceModeFor(null, 'twilio', 'production')).toBe(false);
  });

  it('is on for a saved line with no number yet', () => {
    expect(practiceModeFor(none, 'twilio', 'production')).toBe(true);
    expect(practiceModeFor(none, 'fake', 'development')).toBe(true);
  });

  it('is on in production on Twilio while the number has no Messaging Service', () => {
    expect(practiceModeFor(numberOnly, 'twilio', 'production')).toBe(true);
  });

  it('is off as soon as the line has a real number and its service', () => {
    expect(practiceModeFor(both, 'twilio', 'production')).toBe(false);
  });

  it('is off with just a number on the fake provider or in development, like the setup page', () => {
    expect(practiceModeFor(numberOnly, 'fake', 'production')).toBe(false);
    expect(practiceModeFor(numberOnly, 'twilio', 'development')).toBe(false);
  });

  it('is exactly the opposite of a ready line for any saved line', () => {
    for (const line of [none, numberOnly, both]) {
      for (const provider of ['twilio', 'fake']) {
        for (const env of ['production', 'development', undefined]) {
          expect(practiceModeFor(line, provider, env)).toBe(!lineNumberReady(line, provider, env));
        }
      }
    }
  });
});
