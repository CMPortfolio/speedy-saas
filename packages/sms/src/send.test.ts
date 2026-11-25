import { describe, expect, it } from 'vitest';

import type { E164 } from '@speedy/lib/phone';

import { fakeProvider } from './fake';
import { applyOptOutKeyword, sendFirstOrFollowup, type OptOutStore } from './send';

function memoryStore(initial: E164[] = []): OptOutStore & { optedOut: Set<string> } {
  const optedOut = new Set<string>(initial);
  return {
    optedOut,
    async isOptedOut(n) {
      return optedOut.has(n);
    },
    async setOptedOut(n, v) {
      if (v) optedOut.add(n);
      else optedOut.delete(n);
    },
  };
}

const base = {
  to: '+12395550123' as E164,
  from: '+12395550100' as E164,
  body: 'Sorry we missed your call. What do you need?',
  businessName: 'Gulf Coast Plumbing',
};

describe('sendFirstOrFollowup', () => {
  it('refuses to text an opted-out number and sends nothing', async () => {
    const p = fakeProvider();
    const r = await sendFirstOrFollowup(p, memoryStore(['+12395550123']), {
      ...base,
      isFirstContact: true,
    });
    expect(!r.ok && r.error.code).toBe('opted_out');
    expect(p.sent).toHaveLength(0);
  });

  it('adds the opt-out footer on first contact', async () => {
    const p = fakeProvider();
    const r = await sendFirstOrFollowup(p, memoryStore(), { ...base, isFirstContact: true });
    expect(r.ok).toBe(true);
    expect(p.sent[0]?.body).toBe(
      'Sorry we missed your call. What do you need?\nGulf Coast Plumbing. Reply STOP to opt out.',
    );
    expect(p.sent[0]).toMatchObject({ to: base.to, from: base.from });
  });

  it('sends a follow-up as written, without the footer', async () => {
    const p = fakeProvider();
    await sendFirstOrFollowup(p, memoryStore(), {
      ...base,
      body: 'On my way',
      isFirstContact: false,
    });
    expect(p.sent[0]?.body).toBe('On my way');
  });

  it('passes provider failures through as the Result', async () => {
    const p = fakeProvider();
    p.failNext();
    const r = await sendFirstOrFollowup(p, memoryStore(), { ...base, isFirstContact: false });
    expect(!r.ok && r.error.code).toBe('provider_failed');
  });
});

describe('applyOptOutKeyword', () => {
  it('records STOP and START and reports whether anything changed', async () => {
    const store = memoryStore();
    expect(await applyOptOutKeyword(store, base.to, 'stop')).toBe(true);
    expect(store.optedOut.has(base.to)).toBe(true);
    expect(await applyOptOutKeyword(store, base.to, 'stop')).toBe(false);
    expect(await applyOptOutKeyword(store, base.to, 'start')).toBe(true);
    expect(store.optedOut.has(base.to)).toBe(false);
  });

  it('ignores help and ordinary messages', async () => {
    const store = memoryStore();
    expect(await applyOptOutKeyword(store, base.to, 'help')).toBe(false);
    expect(await applyOptOutKeyword(store, base.to, 'message')).toBe(false);
    expect(store.optedOut.size).toBe(0);
  });
});
