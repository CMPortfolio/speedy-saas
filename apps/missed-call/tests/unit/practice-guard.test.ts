import { describe, expect, it } from 'vitest';

import { guardPractice, type GuardLine } from '../../src/features/practice/practice-guard';

const base: GuardLine = {
  providerNumber: null,
  messagingServiceSid: null,
  businessName: 'Gulf Coast Plumbing',
  template: 'Sorry we missed you.',
  afterHoursTemplate: null,
  quietHours: null,
  timezone: 'America/New_York',
  ownerCell: '+12395550101',
};

describe('guardPractice', () => {
  it('lets a saved line with no number practice, handing back only what the flow needs', () => {
    const g = guardPractice(base);
    expect(g.ok).toBe(true);
    expect(g.ok && g.line).toEqual({
      businessName: 'Gulf Coast Plumbing',
      template: 'Sorry we missed you.',
      afterHoursTemplate: null,
      quietHours: null,
      timezone: 'America/New_York',
      ownerCell: '+12395550101',
    });
  });

  it('refuses before the owner has saved a line', () => {
    const g = guardPractice(null);
    expect(!g.ok && g.message).toMatch(/Save your setup/);
  });

  it('refuses once a real number and its Messaging Service are set, with the reason in plain words', () => {
    const real = {
      ...base,
      providerNumber: '+12395550142',
      messagingServiceSid: 'MG' + 'a'.repeat(32),
    };
    const g = guardPractice(real);
    expect(!g.ok && g.message).toMatch(/practice is switched off/);
  });

  it('refuses with a number but no Messaging Service yet: that line is real, just unfinished', () => {
    const g = guardPractice({ ...base, providerNumber: '+12395550142' });
    expect(g.ok).toBe(false);
    expect(!g.ok && g.message).toMatch(/practice is switched off/);
  });

  it('takes its answer only from the line and the server config, nothing else', () => {
    // The function has no parameter a request could fill: just the line row.
    expect(guardPractice.length).toBe(1);
  });
});
