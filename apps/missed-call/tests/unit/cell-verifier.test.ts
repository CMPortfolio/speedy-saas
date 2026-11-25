import { fakeProvider } from '@speedy/sms/fake';
import { VERIFY_RULES, type VerifyChallenge, type VerifyStore } from '@speedy/sms/verify-phone';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createOwnerCellVerifier,
  type CellLine,
  type OwnerCellVerifier,
} from '../../src/features/setup/cell-verifier';

const OWNER = 'owner-1';
const CELL = '+12395550101';

function memoryVerifyStore(now: () => Date): VerifyStore & { sends: Date[] } {
  const sends: Date[] = [];
  let challenge: VerifyChallenge | null = null;
  return {
    sends,
    async reserveSend(_s, limit, windowMs) {
      const recent = sends.filter((d) => d.getTime() > now().getTime() - windowMs);
      if (recent.length >= limit) return false;
      sends.push(now());
      return true;
    },
    async saveChallenge(_s, c) {
      challenge = { ...c, attempts: 0 };
    },
    async getChallenge() {
      return challenge;
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
}

let clock: Date;
let sms: ReturnType<typeof fakeProvider>;
let line: CellLine | null;
let verified: string[];
let verifier: OwnerCellVerifier;
let store: ReturnType<typeof memoryVerifyStore>;

const baseLine: CellLine = {
  ownerCell: CELL,
  ownerCellVerified: false,
  providerNumber: '+12395550100',
  businessName: 'Gulf Coast Plumbing',
};
const lastCode = () => /\b(\d{6})\b/.exec(sms.sent.at(-1)?.body ?? '')?.[1] ?? '';

beforeEach(() => {
  clock = new Date('2026-07-15T14:00:00Z');
  sms = fakeProvider();
  line = { ...baseLine };
  verified = [];
  store = memoryVerifyStore(() => clock);
  verifier = createOwnerCellVerifier({
    provider: sms,
    store,
    now: () => clock,
    loadLine: async () => line,
    markVerified: async (_o, phone) => {
      if (line?.ownerCell !== phone) return false;
      verified.push(phone);
      return true;
    },
  });
});

describe('start', () => {
  it('texts a code to the cell on the line, from the line number, naming the business', async () => {
    const r = await verifier.start(OWNER);
    expect(r).toEqual({
      ok: true,
      message: 'We texted a code to (239) 555-0101. It lasts 10 minutes.',
    });
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]).toMatchObject({ to: CELL, from: '+12395550100' });
    expect(sms.sent[0]?.body).toMatch(
      /^Your Gulf Coast Plumbing missed-call code is \d{6}\. It expires in 10 minutes\.$/,
    );
  });

  it.each([
    ['no line', null, 'no_line'],
    ['already confirmed', { ...baseLine, ownerCellVerified: true }, 'already_confirmed'],
    ['no number yet', { ...baseLine, providerNumber: null }, 'no_number'],
    ['a non-US cell', { ...baseLine, ownerCell: '+14165550101' }, 'bad_cell'],
  ] as const)('sends nothing with %s', async (_n, l, code) => {
    line = l;
    const r = await verifier.start(OWNER);
    expect(!r.ok && r.code).toBe(code);
    expect(sms.sent).toHaveLength(0);
  });

  it('allows three codes an hour, then says so, and frees up after the hour', async () => {
    for (let i = 0; i < 3; i += 1) expect((await verifier.start(OWNER)).ok).toBe(true);
    const r = await verifier.start(OWNER);
    expect(!r.ok && r.code).toBe('rate_limited');
    expect(sms.sent).toHaveLength(3);
    clock = new Date(clock.getTime() + 61 * 60_000);
    expect((await verifier.start(OWNER)).ok).toBe(true);
  });

  it('reports a failed send plainly and a number that cannot get texts', async () => {
    sms.failNext();
    const r = await verifier.start(OWNER);
    expect(!r.ok && r.code).toBe('failed');
    sms.failNext({ code: 'invalid_number', message: 'x' });
    const r2 = await verifier.start(OWNER);
    expect(!r2.ok && r2.code).toBe('invalid_number');
  });
});

describe('confirm', () => {
  it('confirms the cell with the right code, once', async () => {
    await verifier.start(OWNER);
    const code = lastCode();
    expect(await verifier.confirm(OWNER, code)).toEqual({
      ok: true,
      message: 'Your cell is confirmed. Replies will be texted to you.',
    });
    expect(verified).toEqual([CELL]);
    const again = await verifier.confirm(OWNER, code);
    expect(!again.ok && again.code).toBe('none');
    expect(verified).toHaveLength(1);
  });

  it('accepts a code typed with spaces', async () => {
    await verifier.start(OWNER);
    const code = lastCode();
    const r = await verifier.confirm(OWNER, `${code.slice(0, 3)} ${code.slice(3)}`);
    expect(r.ok).toBe(true);
  });

  it('says how many tries are left, then locks after the fifth wrong one', async () => {
    await verifier.start(OWNER);
    const right = lastCode();
    const wrong = right === '000000' ? '111111' : '000000';
    const first = await verifier.confirm(OWNER, wrong);
    expect(first).toEqual({
      ok: false,
      code: 'wrong',
      message: 'That code is not right. 4 tries left.',
    });
    for (let i = 0; i < 3; i += 1) await verifier.confirm(OWNER, wrong);
    const last = await verifier.confirm(OWNER, wrong);
    expect(!last.ok && last.message).toBe('Too many wrong tries. Send a new code.');
    const rightAfter = await verifier.confirm(OWNER, right);
    expect(!rightAfter.ok && rightAfter.code).toBe('none');
    expect(verified).toEqual([]);
  });

  it('a tried-and-right code at the very limit still works (fifth try)', async () => {
    await verifier.start(OWNER);
    const right = lastCode();
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < VERIFY_RULES.maxAttempts - 1; i += 1) await verifier.confirm(OWNER, wrong);
    expect((await verifier.confirm(OWNER, right)).ok).toBe(true);
  });

  it('expires after ten minutes', async () => {
    await verifier.start(OWNER);
    const code = lastCode();
    clock = new Date(clock.getTime() + 10 * 60_000);
    const r = await verifier.confirm(OWNER, code);
    expect(r).toEqual({
      ok: false,
      code: 'expired',
      message: 'That code expired. Send a new one.',
    });
  });

  it('says to send a code first when none is pending', async () => {
    const r = await verifier.confirm(OWNER, '123456');
    expect(!r.ok && r.code).toBe('none');
  });

  it('confirms nothing when the cell on the line changed after the code was sent', async () => {
    await verifier.start(OWNER);
    const code = lastCode();
    line = { ...baseLine, ownerCell: '+12395550188' };
    const r = await verifier.confirm(OWNER, code);
    expect(!r.ok && r.code).toBe('cell_changed');
    expect(verified).toEqual([]);
  });

  it('a new code replaces the old one', async () => {
    await verifier.start(OWNER);
    const first = lastCode();
    await verifier.start(OWNER);
    const second = lastCode();
    if (first !== second) {
      const old = await verifier.confirm(OWNER, first);
      expect(old.ok).toBe(false);
    }
    expect((await verifier.confirm(OWNER, second)).ok).toBe(true);
  });
});
