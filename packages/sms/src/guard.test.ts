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
    expect(fakeSmsForbidden({ nodeEnv: 'production', allowFakeSms: '1' })).toBeNull();
    expect(fakeSmsForbidden({ nodeEnv: 'production', allowFakeSms: 'true' })).not.toBeNull();
    expect(
      fakeSmsForbidden({
        nodeEnv: 'production',
        railwayEnvironment: 'production',
        allowFakeSms: '1',
      }),
    ).not.toBeNull();
  });
});

describe('isProductionLike', () => {
  it('is true for production and for Railway', () => {
    expect(isProductionLike({ nodeEnv: 'production' })).toBe(true);
    expect(isProductionLike({ railwayEnvironment: 'staging' })).toBe(true);
    expect(isProductionLike({ nodeEnv: 'development' })).toBe(false);
  });
});
