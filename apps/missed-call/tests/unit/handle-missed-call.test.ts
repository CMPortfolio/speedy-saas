import type { CallStatusEvent } from '@speedy/sms/provider';
import { fakeProvider } from '@speedy/sms/fake';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleMissedCall } from '../../src/features/missed-calls/handle-missed-call';
import type { LineRecord } from '../../src/features/missed-calls/store';
import { memoryStore } from './memory-store';

const LINE_NUMBER = '+12395550100';
const CALLER = '+12395550123';

const line: LineRecord = {
  id: 'line-1',
  providerNumber: LINE_NUMBER,
  ownerCell: '+12395550101',
  ownerCellVerified: true,
  messagingServiceSid: null,
  businessName: 'Gulf Coast Plumbing',
  template: 'Sorry we missed your call. What do you need?',
  afterHoursTemplate: 'We are closed. We will call you first thing in the morning.',
  quietHours: { start: '17:00', end: '08:00' },
  timezone: 'America/New_York',
};

const event = (over: Partial<CallStatusEvent> = {}): CallStatusEvent => ({
  kind: 'call',
  callSid: 'CA1',
  from: CALLER,
  to: LINE_NUMBER,
  status: 'ringing',
  direction: 'inbound',
  ...over,
});

// Wednesday 2026-07-15, 10:00 New York (in hours) and 22:00 New York (quiet).
const MORNING = new Date('2026-07-15T14:00:00Z');
const NIGHT = new Date('2026-07-16T02:00:00Z');

let sms: ReturnType<typeof fakeProvider>;
let mem: ReturnType<typeof memoryStore>;
let clock: Date;

const run = (e: CallStatusEvent) =>
  handleMissedCall({ provider: sms, store: mem.store, now: () => clock }, e);

beforeEach(() => {
  sms = fakeProvider();
  clock = MORNING;
  mem = memoryStore([line], () => clock);
});

describe('handleMissedCall', () => {
  it('logs the call and texts the owner template, then plays a short greeting', async () => {
    const twiml = await run(event());
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]).toMatchObject({ to: CALLER, from: LINE_NUMBER });
    expect(sms.sent[0]?.body).toContain('Sorry we missed your call. What do you need?');
    expect(mem.calls).toHaveLength(1);
    expect(mem.calls[0]?.status).toBe('texted');
    expect(mem.messages).toHaveLength(1);
    expect(twiml).toContain('<Say>');
    expect(twiml).toContain('Gulf Coast Plumbing');
    expect(twiml).toContain('<Hangup/>');
  });

  it('adds the business name and opt-out line to the first text only', async () => {
    await run(event());
    expect(sms.sent[0]?.body).toContain('Gulf Coast Plumbing. Reply STOP to opt out.');
    clock = new Date(MORNING.getTime() + 25 * 3600 * 1000);
    await run(event({ callSid: 'CA2' }));
    expect(sms.sent).toHaveLength(2);
    expect(sms.sent[1]?.body).not.toContain('Reply STOP');
  });

  it('does not text the same caller again within 24 hours, but still logs the call', async () => {
    await run(event());
    clock = new Date(MORNING.getTime() + 23 * 3600 * 1000 + 59 * 60 * 1000);
    const twiml = await run(event({ callSid: 'CA2' }));
    expect(sms.sent).toHaveLength(1);
    expect(mem.calls).toHaveLength(2);
    expect(mem.calls[1]?.status).toBe('missed');
    expect(twiml).not.toContain('text');
  });

  it('texts again once 24 hours have passed', async () => {
    await run(event());
    clock = new Date(MORNING.getTime() + 24 * 3600 * 1000 + 60 * 1000);
    await run(event({ callSid: 'CA2' }));
    expect(sms.sent).toHaveLength(2);
  });

  it('keeps the cooldown per caller: another number is texted', async () => {
    await run(event());
    await run(event({ callSid: 'CA2', from: '+12395550188' }));
    expect(sms.sent.map((s) => s.to)).toEqual([CALLER, '+12395550188']);
  });

  it('never texts a blocked number, but logs the call', async () => {
    mem.block(line.id, CALLER, 'junk');
    await run(event());
    expect(sms.sent).toHaveLength(0);
    expect(mem.calls).toHaveLength(1);
  });

  it('never texts a number that texted STOP', async () => {
    mem.block(line.id, CALLER, 'opted_out');
    await run(event({ status: 'no-answer' }));
    expect(sms.sent).toHaveLength(0);
  });

  it('is idempotent: a retried webhook or the later status callback does not text twice', async () => {
    await run(event());
    await run(event());
    await run(event({ status: 'no-answer' }));
    expect(sms.sent).toHaveLength(1);
    expect(mem.calls).toHaveLength(1);
  });
});

describe('handleMissedCall templates and edge cases', () => {
  it('sends the after-hours template outside the owner hours', async () => {
    clock = NIGHT;
    await run(event());
    expect(sms.sent[0]?.body).toContain('We are closed.');
    expect(sms.sent[0]?.body).not.toContain('What do you need?');
  });

  it('uses the regular template after hours when no after-hours template is set', async () => {
    clock = NIGHT;
    mem = memoryStore([{ ...line, afterHoursTemplate: null }], () => clock);
    await run(event());
    expect(sms.sent[0]?.body).toContain('What do you need?');
  });

  it('uses the regular template when the line has no quiet hours', async () => {
    clock = NIGHT;
    mem = memoryStore([{ ...line, quietHours: null }], () => clock);
    await run(event());
    expect(sms.sent[0]?.body).toContain('What do you need?');
  });

  it('honours the line timezone', async () => {
    // 14:00Z is 07:00 in Phoenix: still before 08:00, so quiet there, in hours in New York.
    mem = memoryStore([{ ...line, timezone: 'America/Phoenix' }], () => clock);
    await run(event());
    expect(sms.sent[0]?.body).toContain('We are closed.');
  });

  it('releases the claim when the send fails, so the next call can text', async () => {
    sms.failNext();
    const twiml = await run(event());
    expect(sms.sent).toHaveLength(0);
    expect(mem.calls[0]?.status).toBe('missed');
    expect(mem.calls[0]?.textedAt).toBeNull();
    expect(twiml).toContain('<Say>');
    await run(event({ callSid: 'CA2' }));
    expect(sms.sent).toHaveLength(1);
  });

  it('answers an unknown number with a hangup and writes nothing', async () => {
    const twiml = await run(event({ to: '+12395550999' }));
    expect(twiml).toContain('<Hangup/>');
    expect(twiml).not.toContain('<Say>');
    expect(mem.calls).toHaveLength(0);
    expect(sms.sent).toHaveLength(0);
  });

  it.each(['completed', 'failed', 'canceled'] as const)(
    'ignores %s status callbacks',
    async (s) => {
      expect(await run(event({ status: s }))).toBeUndefined();
      expect(mem.touched).toBe(0);
    },
  );

  it('ignores calls the line placed itself', async () => {
    expect(await run(event({ direction: 'outbound' }))).toBeUndefined();
    expect(mem.touched).toBe(0);
  });

  it('escapes the business name in the greeting', async () => {
    mem = memoryStore([{ ...line, businessName: 'Ed & Sons <Roofing>' }], () => clock);
    const twiml = await run(event());
    expect(twiml).toContain('Ed &amp; Sons &lt;Roofing&gt;');
  });

  it('answers the call when the provider hangs, keeps the claim and does not text twice on retry', async () => {
    const slow = { ...sms, sendText: () => new Promise<never>(() => undefined) };
    const twiml = await handleMissedCall(
      { provider: slow, store: mem.store, now: () => clock, sendTimeoutMs: 20 },
      event(),
    );
    expect(twiml).toContain('<Say>');
    expect(mem.calls[0]?.textedAt).not.toBeNull();
    await run(event());
    expect(sms.sent).toHaveLength(0);
  });

  it('still answers the call when saving the sent text fails', async () => {
    const broken = { ...mem.store, recordTextSent: () => Promise.reject(new Error('db down')) };
    const twiml = await handleMissedCall(
      { provider: sms, store: broken, now: () => clock },
      event(),
    );
    expect(sms.sent).toHaveLength(1);
    expect(twiml).toContain('<Say>');
  });

  it.each([
    ['Toronto', '+14165550123'],
    ['Jamaica', '+18765550123'],
    ['Puerto Rico', '+17875550123'],
  ])('logs a call from %s but never texts it', async (_n, from) => {
    await run(event({ from: from as CallStatusEvent['from'] }));
    expect(sms.sent).toHaveLength(0);
    expect(mem.calls).toHaveLength(1);
    expect(mem.calls[0]?.status).toBe('missed');
  });

  it('stops texting a line after 20 auto-texts in an hour, but keeps logging calls', async () => {
    for (let i = 0; i < 25; i += 1) {
      const from = `+1239555${String(1000 + i)}` as CallStatusEvent['from'];
      await run(event({ callSid: `CAcap${i}`, from }));
    }
    expect(sms.sent).toHaveLength(20);
    expect(mem.calls).toHaveLength(25);
  });
});

describe('handleMissedCall failures and late sends', () => {
  it('still answers with the greeting when releasing the claim fails', async () => {
    sms.failNext();
    const broken = { ...mem.store, releaseTextClaim: () => Promise.reject(new Error('db down')) };
    const twiml = await handleMissedCall(
      { provider: sms, store: broken, now: () => clock },
      event(),
    );
    expect(twiml).toContain('<Say>');
  });

  it('records a text that finishes after the timeout, using the deferred task', async () => {
    let finish: (v: Awaited<ReturnType<typeof sms.sendText>>) => void = () => undefined;
    const slow = {
      ...sms,
      sendText: () => new Promise<Awaited<ReturnType<typeof sms.sendText>>>((r) => (finish = r)),
    };
    const deferred: Promise<unknown>[] = [];
    const twiml = await handleMissedCall(
      {
        provider: slow,
        store: mem.store,
        now: () => clock,
        sendTimeoutMs: 20,
        defer: (task) => deferred.push(task),
      },
      event(),
    );
    expect(twiml).toContain('<Say>');
    expect(mem.messages).toHaveLength(0);
    finish({ ok: true, value: { providerMessageId: 'LATE1' } });
    await Promise.all(deferred);
    expect(mem.messages).toHaveLength(1);
    expect(mem.messages[0]?.providerMessageId).toBe('LATE1');
    expect(mem.calls[0]?.status).toBe('texted');
  });

  it('releases the claim when a text that timed out turns out to have failed', async () => {
    let finish: (v: Awaited<ReturnType<typeof sms.sendText>>) => void = () => undefined;
    const slow = {
      ...sms,
      sendText: () => new Promise<Awaited<ReturnType<typeof sms.sendText>>>((r) => (finish = r)),
    };
    const deferred: Promise<unknown>[] = [];
    await handleMissedCall(
      {
        provider: slow,
        store: mem.store,
        now: () => clock,
        sendTimeoutMs: 20,
        defer: (task) => deferred.push(task),
      },
      event(),
    );
    finish({ ok: false, error: { code: 'provider_failed', message: 'x' } });
    await Promise.all(deferred);
    expect(mem.calls[0]?.textedAt).toBeNull();
  });

  it('stores the text exactly as sent, opt-out footer included', async () => {
    await run(event());
    expect(mem.messages[0]?.body).toBe(sms.sent[0]?.body);
    expect(mem.messages[0]?.body).toContain('Reply STOP to opt out');
  });

  it('gives a retried webhook the same greeting as the first one', async () => {
    const first = await run(event());
    const retry = await run(event());
    expect(retry).toBe(first);
  });

  it('sends from the line number through the line Messaging Service when it has one', async () => {
    mem = memoryStore(
      [{ ...line, messagingServiceSid: 'MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }],
      () => clock,
    );
    await run(event());
    expect(sms.sent[0]).toMatchObject({
      from: LINE_NUMBER,
      messagingServiceSid: 'MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
  });

  it('sends with no Messaging Service when the line has none', async () => {
    await run(event());
    expect(sms.sent[0]).toMatchObject({ from: LINE_NUMBER });
    expect(sms.sent[0]).not.toHaveProperty('messagingServiceSid');
  });

  describe('a line with no Messaging Service on the real provider in production', () => {
    let twilio: typeof sms;
    beforeEach(() => {
      twilio = { ...sms, name: 'twilio' } as unknown as typeof sms;
      vi.stubEnv('NODE_ENV', 'production');
    });
    afterEach(() => vi.unstubAllEnvs());

    const runOn = (provider: typeof sms, e = event()) =>
      handleMissedCall({ provider, store: mem.store, now: () => clock }, e);

    it('sends nothing, releases the claim and still logs the call', async () => {
      const twiml = await runOn(twilio);
      expect(sms.sent).toHaveLength(0);
      expect(mem.calls).toHaveLength(1);
      expect(mem.calls[0]?.status).toBe('missed');
      expect(mem.calls[0]?.textedAt).toBeNull();
      expect(twiml).toContain('<Say>');
      expect(twiml).not.toContain('sending you a text');
    });

    it('texts as soon as the line has a Messaging Service', async () => {
      mem = memoryStore(
        [{ ...line, messagingServiceSid: 'MGdddddddddddddddddddddddddddddddd' }],
        () => clock,
      );
      await runOn(twilio);
      expect(sms.sent).toHaveLength(1);
    });

    it('does not touch the fake provider or development', async () => {
      await runOn(sms);
      expect(sms.sent).toHaveLength(1);
      vi.stubEnv('NODE_ENV', 'development');
      mem = memoryStore([line], () => clock);
      await runOn(twilio, event({ callSid: 'CA-dev' }));
      expect(sms.sent).toHaveLength(2);
    });
  });
});
