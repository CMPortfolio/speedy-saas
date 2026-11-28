import { describe, expect, it } from 'vitest';

import { DEFAULT_NEXT, rainDayNext } from '@/lib/next-path';

describe('rainDayNext', () => {
  it.each([
    ['/rain-day', '/rain-day'],
    ['/rain-day?from=2026-12-01&to=2026-12-02', '/rain-day?from=2026-12-01&to=2026-12-02'],
    [
      '/rain-day/3f1d1c1e-8b0f-4b7e-9a57-0d8f5c7a1111',
      '/rain-day/3f1d1c1e-8b0f-4b7e-9a57-0d8f5c7a1111',
    ],
    ['/customers', '/customers'],
    ['/customers/import', '/customers/import'],
    ['/settings', '/settings'],
  ])('keeps a page that exists here: %s', (input, expected) => {
    expect(rainDayNext(input)).toBe(expected);
  });

  it.each([
    // Another tool's pages: the owner signed in on Missed Call, whose sign-in goes to /setup.
    '/setup',
    '/calls',
    '/new',
    '/',
    '',
    '/rain-dayz',
    '/settingsx',
  ])('falls back to Rain day for a page that is not ours: %j', (input) => {
    expect(rainDayNext(input)).toBe(DEFAULT_NEXT);
  });

  it('falls back for a missing value and keeps refusing other origins and backslashes', () => {
    expect(rainDayNext(undefined)).toBe(DEFAULT_NEXT);
    expect(rainDayNext(null)).toBe(DEFAULT_NEXT);
    expect(rainDayNext('//evil.example.com/rain-day')).toBe(DEFAULT_NEXT);
    expect(rainDayNext('/\\evil.example.com')).toBe(DEFAULT_NEXT);
    expect(rainDayNext('https://evil.example.com/rain-day')).toBe(DEFAULT_NEXT);
  });
});
