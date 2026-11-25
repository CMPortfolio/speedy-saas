import { describe, expect, it } from 'vitest';

import { planPracticeReply, type PracticeReplyInput } from '@/features/practice/reply';

const base: PracticeReplyInput = {
  customerName: 'Maria Lopez',
  customerPhone: '+12395550123',
  body: 'Can you do Thursday?',
  businessName: 'Green Gulf Lawn',
  optedOut: false,
  helpAnsweredToday: false,
};

describe('planPracticeReply', () => {
  it('a plain reply is the customer’s bubble, a forward to the owner’s cell, and marks the text replied', () => {
    const plan = planPracticeReply(base);
    expect(plan.optOut).toBeNull();
    expect(plan.markReplied).toBe(true);
    expect(plan.rows).toEqual([
      {
        direction: 'in',
        kind: 'text',
        body: 'Can you do Thursday?',
        status: 'received',
        error_code: null,
      },
      {
        direction: 'forward',
        kind: 'text',
        body: 'Maria Lopez replied: "Can you do Thursday?" ((239) 555-0123)',
        status: 'sent',
        error_code: null,
      },
    ]);
  });

  it.each(['Yes', 'yes.', 'START', 'UNSTOP', 'Ok', 'Thanks!'])(
    'a "%s" from someone who is not opted out is an ordinary reply, like in production',
    (body) => {
      const plan = planPracticeReply({ ...base, body });
      expect(plan.optOut).toBeNull();
      expect(plan.rows.map((r) => r.direction)).toEqual(['in', 'forward']);
    },
  );

  it.each(['STOP', ' stop. ', 'UNSUBSCRIBE'])(
    '"%s" opts the customer out and forwards nothing',
    (body) => {
      const plan = planPracticeReply({ ...base, body });
      expect(plan.optOut).toBe('stop');
      expect(plan.markReplied).toBe(false);
      expect(plan.rows.map((r) => r.direction)).toEqual(['in', 'out']);
      expect(plan.rows[1]).toMatchObject({ kind: 'note' });
      expect(plan.rows[1]!.body).toMatch(/won.t get any more texts/i);
    },
  );

  it.each(['START', 'YES', 'UNSTOP'])(
    '"%s" from an opted-out customer opts them back in',
    (body) => {
      const plan = planPracticeReply({ ...base, body, optedOut: true });
      expect(plan.optOut).toBe('start');
      expect(plan.rows.map((r) => r.direction)).toEqual(['in', 'out']);
      expect(plan.rows.some((r) => r.direction === 'forward')).toBe(false);
    },
  );

  it('HELP is answered with the business name, once, and is not forwarded', () => {
    const first = planPracticeReply({ ...base, body: 'HELP' });
    expect(first.optOut).toBeNull();
    expect(first.markReplied).toBe(false);
    expect(first.rows.map((r) => [r.direction, r.kind])).toEqual([
      ['in', 'text'],
      ['out', 'help'],
    ]);
    expect(first.rows[1]!.body).toBe(
      'Green Gulf Lawn: reply STOP to opt out. Msg & data rates may apply.',
    );
    const again = planPracticeReply({ ...base, body: 'help', helpAnsweredToday: true });
    expect(again.rows.map((r) => r.direction)).toEqual(['in']);
  });

  it('a sentence that merely contains stop is an ordinary reply', () => {
    const plan = planPracticeReply({ ...base, body: 'Please stop by tomorrow' });
    expect(plan.optOut).toBeNull();
    expect(plan.rows.map((r) => r.direction)).toEqual(['in', 'forward']);
  });

  it('trims the body and keeps replies short enough for the phone', () => {
    const plan = planPracticeReply({ ...base, body: `  ${'x'.repeat(2000)}  ` });
    expect(plan.rows[0]!.body.length).toBeLessThanOrEqual(1600);
    expect(plan.rows[0]!.body.startsWith('x')).toBe(true);
  });
});
