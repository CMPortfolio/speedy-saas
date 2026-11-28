import { describe, expect, it } from 'vitest';

import { smsHref, telHref, toCallRows, type CallQueryRow } from './call-rows';

const row = (over: Partial<CallQueryRow>): CallQueryRow => ({
  id: 'c1',
  caller_number: '+12395550123',
  received_at: '2026-07-15T14:04:00Z',
  status: 'texted',
  lines: { timezone: 'America/New_York' },
  messages: [],
  ...over,
});

describe('toCallRows', () => {
  it('lists newest first', () => {
    const rows = toCallRows([
      row({ id: 'old', received_at: '2026-07-14T14:00:00Z' }),
      row({ id: 'new', received_at: '2026-07-16T14:00:00Z' }),
      row({ id: 'mid', received_at: '2026-07-15T14:00:00Z' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('shows the caller, the time in the line timezone, the latest reply and the status', () => {
    const [r] = toCallRows([
      row({
        status: 'replied',
        messages: [
          { direction: 'out', body: 'What do you need?', created_at: '2026-07-15T14:04:05Z' },
          { direction: 'in', body: 'leaking water heater', created_at: '2026-07-15T14:06:00Z' },
          { direction: 'in', body: 'garage, today if you can', created_at: '2026-07-15T14:07:00Z' },
        ],
      }),
    ]);
    expect(r).toMatchObject({
      caller: '(239) 555-0123',
      received: 'Wed, Jul 15, 10:04 AM',
      reply: 'garage, today if you can',
      statusLabel: 'Replied',
    });
  });

  it('has no reply when the caller has not answered', () => {
    expect(toCallRows([row({})])[0]?.reply).toBeNull();
  });

  it('falls back to New York time without a line or with an unknown zone', () => {
    expect(toCallRows([row({ lines: null })])[0]?.received).toBe('Wed, Jul 15, 10:04 AM');
    expect(toCallRows([row({ lines: { timezone: 'Nope/Zone' } })])[0]?.received).toBe(
      'Wed, Jul 15, 10:04 AM',
    );
  });
});

describe('links', () => {
  it('opens the phone and the messages app on the caller', () => {
    expect(telHref('+12395550123')).toBe('tel:+12395550123');
    expect(smsHref('+12395550123')).toBe('sms:+12395550123');
  });
});
