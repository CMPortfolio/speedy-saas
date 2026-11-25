import { describe, expect, it } from 'vitest';

import type { E164 } from '@speedy/lib/phone';
import { appError } from '@speedy/lib/result';

import { fakeProvider } from './fake';
import {
  checkPhoneVerification,
  generateCode,
  hashCode,
  startPhoneVerification,
  VERIFY_RULES,
  type VerifyChallenge,
  type VerifyStore,
} from './verify-phone';

const PHONE = '+12395550123' as E164;
const FROM = '+12395550100' as E164;

function memoryStore() {
  let challenge: VerifyChallenge | null = null;
  const sends: number[] = [];
  const store: VerifyStore & { peek(): VerifyChallenge | null; sends: number[] } = {
    sends,
    peek: () => challenge,
    async reserveSend(_subject, limit, windowMs, now) {
      const recent = sends.filter((t) => t > now.getTime() - windowMs);
      if (recent.length >= limit) return false;
      sends.push(now.getTime());
      return true;
    },
    async saveChallenge(_subject, c) {
      challenge = { ...c, attempts: 0 };
    },
    async getChallenge() {
      return challenge ? { ...challenge } : null;
    },
    async consumeAttempt() {
      if (!challenge) return null;
      challenge.attempts += 1;
      return challenge.attempts;
    },
    async clearChallenge() {
      challenge = null;
    },
  };
  return store;
}

/** Start a verification with a known code so the test can type it back. */
async function started(now = new Date('2026-12-01T12:00:00Z')) {
  const provider = fakeProvider();
  const store = memoryStore();
  const res = await startPhoneVerification(
    { provider, store, now: () => now, random: () => 424242 },
    { subject: 'owner-1', phone: PHONE, from: FROM },
  );
  return { provider, store, res, now };
}

describe('generateCode', () => {
  it('is always six digits, including leading zeros', () => {
    expect(generateCode(() => 7)).toBe('000007');
    expect(generateCode(() => 999_999)).toBe('999999');
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
});

describe('hashCode', () => {
  it('is stable for one salt and differs across salts and codes', () => {
    expect(hashCode('123456', 'a')).toBe(hashCode('123456', 'a'));
    expect(hashCode('123456', 'a')).not.toBe(hashCode('123456', 'b'));
    expect(hashCode('123456', 'a')).not.toBe(hashCode('123457', 'a'));
    expect(hashCode('123456', 'a')).not.toContain('123456');
  });
});

describe('startPhoneVerification', () => {
  it('texts the code to that number and stores only a hash that expires in 10 minutes', async () => {
    const { provider, store, res, now } = await started();
    expect(res.ok).toBe(true);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ to: PHONE, from: FROM });
    expect(provider.sent[0]!.body).toContain('424242');
    const saved = store.peek()!;
    expect(JSON.stringify(saved)).not.toContain('424242');
    expect(saved.phone).toBe(PHONE);
    expect(saved.expiresAt.getTime() - now.getTime()).toBe(10 * 60_000);
  });

  it('sends the code through the business Messaging Service when it has one', async () => {
    const provider = fakeProvider();
    const store = memoryStore();
    const start = (messagingServiceSid?: string) =>
      startPhoneVerification(
        { provider, store },
        { subject: 'o', phone: PHONE, from: FROM, messagingServiceSid },
      );
    await start('MG00000000000000000000000000000000');
    await start();
    expect(provider.sent[0]?.messagingServiceSid).toBe('MG00000000000000000000000000000000');
    expect(provider.sent[1]).not.toHaveProperty('messagingServiceSid');
  });

  it('allows 3 code texts an hour and refuses the 4th without sending', async () => {
    const provider = fakeProvider();
    const store = memoryStore();
    const now = new Date('2026-12-01T12:00:00Z');
    const start = () =>
      startPhoneVerification(
        { provider, store, now: () => now },
        { subject: 'o', phone: PHONE, from: FROM },
      );
    for (let i = 0; i < VERIFY_RULES.maxSendsPerWindow; i++) expect((await start()).ok).toBe(true);
    const fourth = await start();
    expect(!fourth.ok && fourth.error.code).toBe('rate_limited');
    expect(provider.sent).toHaveLength(3);
    // An hour later it works again.
    const later = new Date(now.getTime() + 3_600_001);
    const again = await startPhoneVerification(
      { provider, store, now: () => later },
      { subject: 'o', phone: PHONE, from: FROM },
    );
    expect(again.ok).toBe(true);
  });

  it('reports a send failure and leaves no usable code behind', async () => {
    const provider = fakeProvider();
    const store = memoryStore();
    provider.failNext(appError('invalid_number', 'bad'));
    const res = await startPhoneVerification(
      { provider, store },
      { subject: 'o', phone: PHONE, from: FROM },
    );
    expect(!res.ok && res.error.code).toBe('invalid_number');
    expect(store.peek()).toBeNull();
  });
});

describe('checkPhoneVerification', () => {
  it('accepts the right code once, and gives back the verified number', async () => {
    const { store, now } = await started();
    const out = await checkPhoneVerification(
      { store, now: () => now },
      { subject: 'owner-1', code: '424242' },
    );
    expect(out).toEqual({ status: 'verified', phone: PHONE });
    const again = await checkPhoneVerification(
      { store, now: () => now },
      { subject: 'owner-1', code: '424242' },
    );
    expect(again.status).toBe('none');
  });

  it('tolerates spaces around the code', async () => {
    const { store, now } = await started();
    const out = await checkPhoneVerification(
      { store, now: () => now },
      { subject: 'owner-1', code: ' 424 242 ' },
    );
    expect(out.status).toBe('verified');
  });

  it('says wrong with attempts left, then locks after 5 wrong tries even for the right code', async () => {
    const { store, now } = await started();
    const check = (code: string) =>
      checkPhoneVerification({ store, now: () => now }, { subject: 'owner-1', code });
    expect(await check('000000')).toEqual({ status: 'wrong', attemptsLeft: 4 });
    expect(await check('000001')).toEqual({ status: 'wrong', attemptsLeft: 3 });
    await check('000002');
    await check('000003');
    expect((await check('000004')).status).toBe('locked');
    expect((await check('424242')).status).toBe('none');
  });

  it('rejects an expired code, at exactly 10 minutes and after', async () => {
    const { store, now } = await started();
    const at = (ms: number) => ({ store, now: () => new Date(now.getTime() + ms) });
    const justBefore = await checkPhoneVerification(at(10 * 60_000 - 1), {
      subject: 'owner-1',
      code: '424242',
    });
    expect(justBefore.status).toBe('verified');
    const s2 = await started();
    const expired = await checkPhoneVerification(
      { store: s2.store, now: () => new Date(s2.now.getTime() + 10 * 60_000) },
      { subject: 'owner-1', code: '424242' },
    );
    expect(expired.status).toBe('expired');
    expect(s2.store.peek()).toBeNull();
  });

  it('says none when no code was ever sent, and rejects non-numeric input without using an attempt', async () => {
    const empty = memoryStore();
    expect(
      (await checkPhoneVerification({ store: empty }, { subject: 'o', code: '123456' })).status,
    ).toBe('none');
    const { store, now } = await started();
    const out = await checkPhoneVerification(
      { store, now: () => now },
      { subject: 'owner-1', code: 'abcdef' },
    );
    expect(out.status).toBe('wrong');
    expect(store.peek()!.attempts).toBe(0);
  });
});
