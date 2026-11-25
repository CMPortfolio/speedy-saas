import { describe, expect, it } from 'vitest';

import { fakeSmsForbidden, isProductionLike } from './guard';

describe('fakeSmsForbidden', () => {
  it('allows the fake provider in development and tests', () => {
    expect(fakeSmsForbidden({ nodeEnv: 'development' })).toBeNull();
    expect(fakeSmsForbidden({ nodeEnv: 'test' })).toBeNull();
    expect(fakeSmsForbidden({})).toBeNull();
  });

  it('refuses it in production', () => {
    expect(fakeSmsForbidden({ nodeEnv: 'production' })).toMatch(/not allowed in production/);
  });

  it('refuses it on Railway even outside production', () => {
    expect(fakeSmsForbidden({ nodeEnv: 'development', railwayEnvironment: 'production' })).toMatch(
      /deployed/,
    );
  });

  it('lets ALLOW_FAKE_SMS=1 through for a local production build, but never on Railway', () => {
    const local = { nodeEnv: 'production', allowFakeSms: '1', appUrl: 'http://localhost:3002' };
    expect(fakeSmsForbidden(local)).toBeNull();
    expect(fakeSmsForbidden({ ...local, appUrl: 'http://127.0.0.1:3002' })).toBeNull();
    expect(fakeSmsForbidden({ ...local, allowFakeSms: 'true' })).not.toBeNull();
    expect(
      fakeSmsForbidden({
        nodeEnv: 'production',
        railwayEnvironment: 'production',
        allowFakeSms: '1',
      }),
    ).not.toBeNull();
  });
});

describe('ALLOW_FAKE_SMS needs a local APP_URL', () => {
  const base = { nodeEnv: 'production', allowFakeSms: '1' };

  it.each([
    ['a real domain', 'https://missed-call.naplesaiagency.com'],
    ['a lookalike host', 'http://localhost.evil.example'],
    ['a LAN address', 'http://192.168.1.20:3002'],
    ['not a URL', 'localhost'],
    ['unset', undefined],
  ])('refuses with APP_URL as %s', (_n, appUrl) => {
    expect(fakeSmsForbidden({ ...base, appUrl })).toMatch(/APP_URL/);
  });
});

describe('isProductionLike', () => {
  it('is true for production and for Railway', () => {
    expect(isProductionLike({ nodeEnv: 'production' })).toBe(true);
    expect(isProductionLike({ railwayEnvironment: 'staging' })).toBe(true);
    expect(isProductionLike({ nodeEnv: 'development' })).toBe(false);
  });
});
