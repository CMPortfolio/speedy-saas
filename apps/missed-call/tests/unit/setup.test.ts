import { describe, expect, it } from 'vitest';

import { CARRIERS, dialDigits } from '../../src/config/carrier-codes';
import { formatClock, toOpenHours, toQuietHours } from '../../src/features/setup/hours';
import { defaultTemplate, parseSetup } from '../../src/features/setup/schema';
import { getVerifier } from '../../src/features/setup/verify-cell';

const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  const base: Record<string, string> = {
    businessName: 'Gulf Coast Plumbing',
    ownerCell: '(239) 555-0101',
    template: 'Sorry we missed your call. What do you need?',
    afterHoursTemplate: 'We are closed. We will call you first thing.',
    hours: 'set',
    opens: '08:00',
    closes: '17:00',
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) f.set(k, v);
  return f;
};

describe('parseSetup', () => {
  it('accepts a complete form and turns open hours into a quiet window', () => {
    const r = parseSetup(form());
    expect(r).toEqual({
      ok: true,
      value: {
        business_name: 'Gulf Coast Plumbing',
        owner_cell: '+12395550101',
        template: 'Sorry we missed your call. What do you need?',
        after_hours_template: 'We are closed. We will call you first thing.',
        quiet_hours: { start: '17:00', end: '08:00' },
      },
    });
  });

  it('means "always open" with no quiet hours, and an empty after-hours text is null', () => {
    const r = parseSetup(form({ hours: 'always', afterHoursTemplate: '  ' }));
    expect(r.ok && r.value.quiet_hours).toBeNull();
    expect(r.ok && r.value.after_hours_template).toBeNull();
  });

  it.each([
    ['businessName', { businessName: '  ' }],
    ['ownerCell', { ownerCell: '555-0101' }],
    ['ownerCell', { ownerCell: '(416) 555-0101' }],
    ['ownerCell', { ownerCell: '(787) 555-0101' }],
    ['ownerCell', { ownerCell: 'restricted' }],
    ['template', { template: '' }],
    ['template', { template: 'x'.repeat(321) }],
    ['afterHoursTemplate', { afterHoursTemplate: 'x'.repeat(321) }],
    ['hours', { opens: '08:00', closes: '08:00' }],
    ['hours', { opens: '25:00' }],
  ])('rejects a bad %s', (field, over) => {
    const r = parseSetup(form(over));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[field as keyof typeof r.errors]).toBeTruthy();
  });

  it('keeps the limits exact: 320 characters is fine, 120 for the name', () => {
    expect(parseSetup(form({ template: 'x'.repeat(320) })).ok).toBe(true);
    expect(parseSetup(form({ businessName: 'x'.repeat(121) })).ok).toBe(false);
    expect(parseSetup(form({ businessName: 'x'.repeat(120) })).ok).toBe(true);
  });

  it('wording of errors is plain, never about the system', () => {
    const r = parseSetup(form({ ownerCell: 'nope' }));
    expect(!r.ok && r.errors.ownerCell).toBe('Enter the cell number you answer, with area code.');
  });
});

describe('hours', () => {
  it('round trips open hours and the quiet window', () => {
    const open = { opens: '07:30', closes: '16:45' };
    expect(toOpenHours(toQuietHours(open))).toEqual(open);
    expect(toOpenHours(null)).toBeNull();
  });

  it('formats a clock for owners', () => {
    expect(formatClock('08:00')).toBe('8:00 AM');
    expect(formatClock('17:30')).toBe('5:30 PM');
    expect(formatClock('00:05')).toBe('12:05 AM');
    expect(formatClock('12:00')).toBe('12:00 PM');
  });
});

describe('defaultTemplate', () => {
  it('names the business and asks what they need', () => {
    expect(defaultTemplate('Gulf Coast Plumbing')).toContain('Gulf Coast Plumbing');
    expect(defaultTemplate('')).toContain('this is us');
    expect(defaultTemplate('x'.repeat(100)).length).toBeLessThanOrEqual(320);
  });
});

describe('carrier codes', () => {
  const byId = Object.fromEntries(CARRIERS.map((c) => [c.id, c]));

  it('builds the dial codes from the number, as in RESEARCH.md', () => {
    const n = dialDigits('+12395550100');
    expect(n).toBe('2395550100');
    expect(byId.verizon?.activate(n)).toBe('*712395550100');
    expect(byId.verizon?.cancel).toBe('*73');
    expect(byId.tmobile?.activate(n)).toBe('**61*12395550100#');
    expect(byId.tmobile?.cancel).toBe('##61#');
    expect(byId.att?.activate(n)).toBe('**61*12395550100#');
    expect(byId.att?.cancel).toBe('##61#');
    expect(byId.att?.status).toBe('*#61#');
  });

  it('marks only Verizon verified and asks for a test call on the others', () => {
    expect(CARRIERS.filter((c) => c.verified).map((c) => c.id)).toEqual(['verizon']);
    for (const id of ['tmobile', 'att']) {
      expect(byId[id]?.note).toBe('Check with a test call after setting this up.');
    }
  });

  it('has a source URL for every carrier', () => {
    for (const c of CARRIERS) expect(c.sourceUrl).toMatch(/^https:\/\//);
  });
});

describe('owner cell verifier seam', () => {
  it('is unavailable until the shared helper is wired in', async () => {
    const v = getVerifier();
    const start = await v.start({ lineId: 'l1' });
    const confirm = await v.confirm({ lineId: 'l1', code: '123456' });
    expect(!start.ok && start.error.code).toBe('verification_unavailable');
    expect(!confirm.ok && confirm.error.code).toBe('verification_unavailable');
  });
});
