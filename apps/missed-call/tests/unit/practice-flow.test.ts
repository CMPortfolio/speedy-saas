import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearPractice,
  markPracticeCall,
  sendPracticeReply,
  simulateMissedCall,
  type PracticeLine,
} from '../../src/features/practice/practice-flow';
import { isPracticeCaller, nextPracticeCaller } from '../../src/features/practice/numbers';
import { memoryPracticeStore } from './practice-memory-store';

const CALLER = '+12395550123';
const line: PracticeLine = {
  businessName: 'Gulf Coast Plumbing',
  template: 'Sorry we missed your call. What do you need?',
  afterHoursTemplate: 'We are closed. We will call you first thing.',
  quietHours: { start: '17:00', end: '08:00' },
  timezone: 'America/New_York',
  ownerCell: '+12395550101',
};

// Wednesday 2026-07-15: 10:00 in New York (open) and 22:00 (closed).
const MORNING = new Date('2026-07-15T14:00:00Z');
const NIGHT = new Date('2026-07-16T02:00:00Z');

let mem: ReturnType<typeof memoryPracticeStore>;
let now: Date;
const deps = () => ({ store: mem.store, line, now: () => now });
const sent = (direction: string) => mem.messages.filter((m) => m.direction === direction);

beforeEach(() => {
  mem = memoryPracticeStore();
  now = MORNING;
});
afterEach(() => vi.restoreAllMocks());

describe('practice numbers', () => {
  it('only (239) 555-0101 to 0199 are practice callers', () => {
    expect(isPracticeCaller('+12395550101')).toBe(true);
    expect(isPracticeCaller('+12395550199')).toBe(true);
    for (const bad of ['+12395550100', '+12395550200', '+12395551234', '+14165550101', '', 'x']) {
      expect(isPracticeCaller(bad)).toBe(false);
    }
  });

  it('hands out the next unused one, and recycles when all 99 are used', () => {
    expect(nextPracticeCaller([])).toBe('+12395550101');
    expect(nextPracticeCaller(['+12395550101', '+12395550102'])).toBe('+12395550103');
    const all = Array.from({ length: 99 }, (_v, i) => `+12395550${101 + i}`);
    expect(isPracticeCaller(nextPracticeCaller(all, () => 0.5))).toBe(true);
  });
});

describe('simulateMissedCall', () => {
  it('logs the call and shows the owner template on the caller phone, with the STOP line', async () => {
    const r = await simulateMissedCall(deps(), CALLER);
    expect(r.ok).toBe(true);
    expect(mem.calls).toHaveLength(1);
    expect(mem.calls[0]).toMatchObject({ callerNumber: CALLER, status: 'texted' });
    expect(sent('out')).toHaveLength(1);
    expect(sent('out')[0]?.body).toContain('Sorry we missed your call. What do you need?');
    expect(sent('out')[0]?.body).toContain('Gulf Coast Plumbing. Reply STOP to opt out.');
  });

  it('uses the after-hours text outside the owner hours (Eastern)', async () => {
    now = NIGHT;
    await simulateMissedCall(deps(), CALLER);
    expect(sent('out')[0]?.body).toContain('We are closed.');
  });

  it('does not text the same number twice in 24 hours, but logs the call and says why', async () => {
    await simulateMissedCall(deps(), CALLER);
    now = new Date(MORNING.getTime() + 23 * 3600_000);
    const r = await simulateMissedCall(deps(), CALLER);
    expect(r.ok && r.note).toMatch(/24 hours/);
    expect(mem.calls).toHaveLength(2);
    expect(sent('out')).toHaveLength(1);
    now = new Date(MORNING.getTime() + 24 * 3600_000 + 60_000);
    await simulateMissedCall(deps(), CALLER);
    expect(sent('out')).toHaveLength(2);
    expect(sent('out')[1]?.body).not.toContain('Reply STOP');
  });

  it('texts a different practice number straight away', async () => {
    await simulateMissedCall(deps(), CALLER);
    await simulateMissedCall(deps(), '+12395550124');
    expect(sent('out')).toHaveLength(2);
  });

  it('never texts a number marked Junk, or one that replied STOP', async () => {
    await simulateMissedCall(deps(), CALLER);
    await markPracticeCall(deps(), mem.calls[0]!.id, 'junk');
    now = new Date(MORNING.getTime() + 48 * 3600_000);
    const junk = await simulateMissedCall(deps(), CALLER);
    expect(junk.ok && junk.note).toMatch(/Junk/);
    expect(sent('out')).toHaveLength(1);

    await simulateMissedCall(deps(), '+12395550130');
    await sendPracticeReply(deps(), mem.calls.at(-1)!.id, 'STOP');
    now = new Date(MORNING.getTime() + 96 * 3600_000);
    const stopped = await simulateMissedCall(deps(), '+12395550130');
    expect(stopped.ok && stopped.note).toMatch(/STOP/);
    expect(sent('out')).toHaveLength(2);
  });

  it('refuses any number that is not a practice number, and saves nothing', async () => {
    for (const bad of ['+12395550200', '+14155550123', '+12395550100', 'nope']) {
      const r = await simulateMissedCall(deps(), bad);
      expect(!r.ok && r.code).toBe('bad_input');
    }
    expect(mem.calls).toHaveLength(0);
    expect(mem.messages).toHaveLength(0);
    expect(mem.actions).toBe(0);
  });

  it('stops at the hourly limit and when practice is full, saving nothing more', async () => {
    mem = memoryPracticeStore({ actionLimit: 2 });
    await simulateMissedCall(deps(), '+12395550101');
    await simulateMissedCall(deps(), '+12395550102');
    const limited = await simulateMissedCall(deps(), '+12395550103');
    expect(!limited.ok && limited.code).toBe('rate_limited');
    expect(mem.calls).toHaveLength(2);

    mem = memoryPracticeStore({ maxMessages: 1 });
    await simulateMissedCall(deps(), '+12395550101');
    const full = await simulateMissedCall(deps(), '+12395550102');
    expect(!full.ok && full.code).toBe('full');
    expect(!full.ok && full.message).toMatch(/Clear practice/);
  });
});

describe('sendPracticeReply', () => {
  const start = async () => {
    await simulateMissedCall(deps(), CALLER);
    return mem.calls[0]!.id;
  };

  it('saves the reply, marks the call replied and shows the lead on Your cell', async () => {
    const id = await start();
    const r = await sendPracticeReply(deps(), id, 'leaking water heater, garage');
    expect(r.ok).toBe(true);
    expect(sent('in').map((m) => m.body)).toEqual(['leaking water heater, garage']);
    expect(sent('forward').map((m) => m.body)).toEqual([
      'New lead from (239) 555-0123: leaking water heater, garage',
    ]);
    expect(mem.calls[0]?.status).toBe('replied');
  });

  it('a plain Yes is a lead; STOP is not forwarded; START lifts it; HELP gets the standard answer', async () => {
    const id = await start();
    await sendPracticeReply(deps(), id, 'Yes');
    expect(sent('forward')).toHaveLength(1);

    await sendPracticeReply(deps(), id, 'STOP');
    expect(mem.calls[0]?.optedOut).toBe(true);
    expect(sent('forward')).toHaveLength(1);

    await sendPracticeReply(deps(), id, 'START');
    expect(mem.calls[0]?.optedOut).toBe(false);
    expect(sent('forward')).toHaveLength(1);

    await sendPracticeReply(deps(), id, 'HELP');
    expect(sent('out').at(-1)?.body).toContain('Gulf Coast Plumbing: reply STOP to opt out.');
    expect(sent('forward')).toHaveLength(1);
  });

  it('ignores a reply from a number marked Junk, like the real flow', async () => {
    const id = await start();
    await markPracticeCall(deps(), id, 'junk');
    const r = await sendPracticeReply(deps(), id, 'hello?');
    expect(!r.ok && r.code).toBe('ignored');
    expect(sent('in')).toHaveLength(0);
  });

  it('refuses empty, over-long and unknown-call replies', async () => {
    const id = await start();
    expect(!(await sendPracticeReply(deps(), id, '   ')).ok).toBe(true);
    const long = await sendPracticeReply(deps(), id, 'x'.repeat(321));
    expect(!long.ok && long.code).toBe('bad_input');
    const missing = await sendPracticeReply(deps(), 'someone-elses-call', 'hi');
    expect(!missing.ok && missing.code).toBe('not_found');
    expect(sent('in')).toHaveLength(0);
  });

  it('keeps the owner status once they have moved on', async () => {
    const id = await start();
    await markPracticeCall(deps(), id, 'booked');
    await sendPracticeReply(deps(), id, 'see you at 3');
    expect(mem.calls[0]?.status).toBe('booked');
  });
});

describe('markPracticeCall and clearPractice', () => {
  it('sets Called back, Booked and Junk only on the owner own practice calls', async () => {
    await simulateMissedCall(deps(), CALLER);
    const id = mem.calls[0]!.id;
    for (const status of ['called_back', 'booked', 'junk'] as const) {
      expect((await markPracticeCall(deps(), id, status)).ok).toBe(true);
      expect(mem.calls[0]?.status).toBe(status);
    }
    const other = await markPracticeCall(deps(), 'not-mine', 'junk');
    expect(!other.ok && other.code).toBe('not_found');
    const bad = await markPracticeCall(deps(), id, 'replied' as 'junk');
    expect(!bad.ok && bad.code).toBe('bad_input');
  });

  it('clear removes everything, and always works even when practice is full or rate limited', async () => {
    mem = memoryPracticeStore({ actionLimit: 1 });
    await simulateMissedCall(deps(), CALLER);
    expect((await simulateMissedCall(deps(), '+12395550124')).ok).toBe(false);
    expect((await clearPractice(deps())).ok).toBe(true);
    expect(mem.calls).toHaveLength(0);
    expect(mem.messages).toHaveLength(0);
  });
});

describe('practice never reaches a carrier', () => {
  it('does not call fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network used'));
    await simulateMissedCall(deps(), CALLER);
    await sendPracticeReply(deps(), mem.calls[0]!.id, 'hello');
    expect(spy).not.toHaveBeenCalled();
  });

  it('the flow imports no real provider, SDK or provider config', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../../src/features/practice/practice-flow.ts'),
      'utf8',
    );
    const imports = [...source.matchAll(/^import[^;]*from '([^']+)'/gm)].map((m) => m[1]);
    for (const forbidden of [
      '@/config/sms',
      '@speedy/sms/twilio',
      '@speedy/sms/create',
      '@speedy/sms/fake',
      'twilio',
    ]) {
      expect(imports).not.toContain(forbidden);
    }
  });
});
