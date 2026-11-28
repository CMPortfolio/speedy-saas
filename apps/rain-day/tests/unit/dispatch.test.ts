import { appError } from '@speedy/lib/result';
import { fakeProvider } from '@speedy/sms/fake';
import type { SendTextInput, SmsProvider } from '@speedy/sms/provider';
import { describe, expect, it } from 'vitest';

import {
  dispatchMessages,
  MAX_CONCURRENT_SENDS,
  type DispatchResult,
  type DispatchRow,
  type DispatchStore,
} from '@/features/rain-day/dispatch';

function setup(n: number, optedOut: string[] = []) {
  const rows: DispatchRow[] = Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    customerId: `c${i}`,
    phone: `+1239555${String(1000 + i)}` as const,
    body: `Hi Customer${i}, moving you to Wednesday.`,
    isFirstContact: true,
  }));
  const updates = new Map<string, DispatchResult>();
  const store: DispatchStore = {
    async isOptedOut(phone) {
      return optedOut.includes(phone);
    },
    async markResult(id, result) {
      updates.set(id, result);
    },
  };
  return { rows, updates, store, provider: fakeProvider() };
}

const base = { from: '+12395550100' as const, businessName: 'Green Gulf Lawn' };

describe('dispatchMessages', () => {
  it('sends 15 separate texts, one per customer, each to that customer only', async () => {
    const { rows, store, provider, updates } = setup(15);
    const out = await dispatchMessages({ provider, store, rows, ...base });
    expect(provider.sent).toHaveLength(15);
    expect(new Set(provider.sent.map((s) => s.to)).size).toBe(15);
    for (const s of provider.sent) {
      for (const other of rows) {
        if (other.phone !== s.to) expect(s.body).not.toContain(other.phone);
      }
      expect(s.to).toMatch(/^\+1\d{10}$/);
    }
    expect(out).toEqual({ sent: 15, failed: 0, skipped: 0 });
    expect([...updates.values()].every((u) => u.status === 'sent')).toBe(true);
  });

  it('never has more than MAX_CONCURRENT_SENDS texts in flight', async () => {
    const { rows, store } = setup(40);
    let inFlight = 0;
    let peak = 0;
    const counting: SmsProvider = {
      name: 'counting',
      async sendText(input: SendTextInput) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 2));
        inFlight -= 1;
        return { ok: true, value: { providerMessageId: `ID-${input.to}` } };
      },
      parseInbound: () => ({ ok: false, error: appError('invalid_webhook', 'n/a') }),
      verifySignature: () => false,
    };
    const out = await dispatchMessages({ provider: counting, store, rows, ...base });
    expect(out.sent).toBe(40);
    expect(MAX_CONCURRENT_SENDS).toBe(5);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_SENDS);
  });

  it('skips a customer who opted out since the list was made and does not text them', async () => {
    const { rows, store, provider, updates } = setup(5, ['+12395551002']);
    const out = await dispatchMessages({ provider, store, rows, ...base });
    expect(provider.sent.map((s) => s.to)).not.toContain('+12395551002');
    expect(provider.sent).toHaveLength(4);
    expect(updates.get('m2')).toEqual({ status: 'skipped', errorCode: 'opted_out' });
    expect(out).toEqual({ sent: 4, failed: 0, skipped: 1 });
  });

  it('does not text a number outside the US even if one got into the rows', async () => {
    const { rows, store, provider, updates } = setup(2);
    rows[0] = { ...rows[0]!, phone: '+14165550123' };
    const out = await dispatchMessages({ provider, store, rows, ...base });
    expect(provider.sent.map((s) => s.to)).toEqual(['+12395551001']);
    expect(updates.get('m0')).toEqual({ status: 'skipped', errorCode: 'non_us' });
    expect(out.skipped).toBe(1);
  });

  it('marks a failed send as failed with its code and keeps going', async () => {
    const { rows, store, provider, updates } = setup(3);
    provider.failNext(appError('invalid_number', 'bad'));
    const out = await dispatchMessages({ provider, store, rows, ...base, concurrency: 1 });
    expect(updates.get('m0')).toEqual({ status: 'failed', errorCode: 'invalid_number' });
    expect(provider.sent).toHaveLength(2);
    expect(out).toEqual({ sent: 2, failed: 1, skipped: 0 });
  });

  it('marks a row failed (internal) when the opt-out lookup throws, and still texts the rest', async () => {
    const { rows, store, provider, updates } = setup(4);
    const lookup = store.isOptedOut;
    store.isOptedOut = async (phone) => {
      if (phone === '+12395551001') throw new Error('db down');
      return lookup(phone);
    };
    const out = await dispatchMessages({ provider, store, rows, ...base });
    expect(updates.get('m1')).toEqual({ status: 'failed', errorCode: 'internal' });
    expect(provider.sent).toHaveLength(3);
    expect(provider.sent.map((s) => s.to)).not.toContain('+12395551001');
    expect(out).toEqual({ sent: 3, failed: 1, skipped: 0 });
  });

  it('adds the opt-out line on first contact only', async () => {
    const { rows, store, provider } = setup(2);
    rows[1]!.isFirstContact = false;
    await dispatchMessages({ provider, store, rows, ...base, concurrency: 1 });
    expect(provider.sent[0]!.body).toContain('Reply STOP to opt out');
    expect(provider.sent[1]!.body).not.toContain('Reply STOP');
  });

  it('keeps going when saving a result throws, and counts the text as sent', async () => {
    const { rows, store, provider } = setup(3);
    let calls = 0;
    store.markResult = async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('db down'), { code: 'XX000' });
    };
    const out = await dispatchMessages({ provider, store, rows, ...base, concurrency: 1 });
    expect(provider.sent).toHaveLength(3);
    expect(out.sent).toBe(3);
  });
});
