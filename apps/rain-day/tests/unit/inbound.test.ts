import type { Db } from '@speedy/db/core';
import type { E164 } from '@speedy/lib/phone';
import { fakeProvider, FAKE_SIGNATURE_HEADER } from '@speedy/sms/fake';
import { describe, expect, it, vi } from 'vitest';

import { forwardText, FORWARD_CAP_PER_HOUR } from '@/features/replies/forward';
import {
  handleInboundText,
  type RecordedReply,
  type ReplyStore,
} from '@/features/replies/handle-inbound';
import { handleInboundWebhook } from '@/features/replies/inbound-webhook';

const CUSTOMER = '+12395550123' as E164;
const OWNER_CELL = '+12395550111';
const BUSINESS = '+12395550100' as E164;

function memoryStore(
  overrides: Partial<RecordedReply> = {},
  helpBusiness: string | null = 'Green Gulf Lawn',
) {
  let helpClaims = 0;
  const optedOut = new Set<string>();
  const forwards: { id: string; status: string }[] = [];
  const recorded: { body: string; forwardCap: number }[] = [];
  const store: ReplyStore = {
    optOuts: {
      async isOptedOut(n) {
        return optedOut.has(n);
      },
      async setOptedOut(n, v) {
        if (v) optedOut.add(n);
        else optedOut.delete(n);
      },
    },
    async recordReply(input) {
      recorded.push({ body: input.body, forwardCap: input.forwardCap });
      return {
        matched: true,
        duplicate: false,
        replyId: 'reply-1',
        customerName: 'Maria Lopez',
        customerPhone: input.from,
        ownerCell: OWNER_CELL,
        forward: true,
        ...overrides,
      };
    },
    async markForward(id, status) {
      forwards.push({ id, status });
    },
    async helpBusinessName() {
      return helpBusiness;
    },
    async claimHelp() {
      helpClaims += 1;
      return helpClaims === 1;
    },
  };
  return { store, optedOut, forwards, recorded };
}

const inbound = (body: string, id = 'IN1') => ({
  kind: 'inbound' as const,
  from: CUSTOMER,
  to: BUSINESS,
  body,
  providerMessageId: id,
});

describe('forwardText', () => {
  it('names the customer, quotes the reply and gives their number', () => {
    expect(forwardText('Maria Lopez', CUSTOMER, 'Can you do Thursday?')).toBe(
      'Maria Lopez replied: "Can you do Thursday?" ((239) 555-0123)',
    );
  });
  it('flattens line breaks and trims very long replies', () => {
    const text = forwardText('Maria', CUSTOMER, `a\n\nb ${'x'.repeat(500)}`);
    expect(text).not.toContain('\n');
    expect(text.length).toBeLessThan(400);
    expect(text).toContain('…');
  });
});

describe('handleInboundText', () => {
  it('forwards a reply to the owner with the customer’s name, once, using the hourly cap', async () => {
    const provider = fakeProvider();
    const { store, forwards, recorded } = memoryStore();
    await handleInboundText({ provider, store }, inbound('Can you do Thursday?'));
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ to: OWNER_CELL, from: BUSINESS });
    expect(provider.sent[0]!.body).toContain('Maria Lopez');
    expect(provider.sent[0]!.body).toContain('Can you do Thursday?');
    expect(forwards).toEqual([{ id: 'reply-1', status: 'sent' }]);
    expect(recorded[0]!.forwardCap).toBe(FORWARD_CAP_PER_HOUR);
    expect(FORWARD_CAP_PER_HOUR).toBe(30);
  });

  it.each([
    ['a duplicate delivery', { duplicate: true, forward: false }],
    ['no verified cell', { forward: false, ownerCell: null }],
    ['over the hourly cap', { forward: false }],
    ['a number we never texted', { matched: false, forward: false, replyId: null }],
  ])('does not forward for %s', async (_label, overrides) => {
    const provider = fakeProvider();
    const { store, forwards } = memoryStore(overrides);
    await handleInboundText({ provider, store }, inbound('hello'));
    expect(provider.sent).toHaveLength(0);
    expect(forwards).toHaveLength(0);
  });

  it('marks the forward failed when the owner’s text does not go', async () => {
    const provider = fakeProvider();
    provider.failNext();
    const { store, forwards } = memoryStore();
    await handleInboundText({ provider, store }, inbound('hi'));
    expect(forwards).toEqual([{ id: 'reply-1', status: 'failed' }]);
  });

  it('STOP opts the number out, and START clears it, with nothing forwarded or recorded', async () => {
    const provider = fakeProvider();
    const { store, optedOut, recorded } = memoryStore();
    await handleInboundText({ provider, store }, inbound('STOP'));
    expect(optedOut.has(CUSTOMER)).toBe(true);
    await handleInboundText({ provider, store }, inbound(' stop. '));
    await handleInboundText({ provider, store }, inbound('START'));
    expect(optedOut.has(CUSTOMER)).toBe(false);
    expect(recorded).toHaveLength(0);
    expect(provider.sent).toHaveLength(0);
  });

  it.each(['YES', 'Yes', 'yes.', 'START', 'UNSTOP'])(
    'a "%s" from someone who is not opted out is an ordinary reply and is forwarded',
    async (word) => {
      const provider = fakeProvider();
      const { store, optedOut, recorded } = memoryStore();
      await handleInboundText({ provider, store }, inbound(word));
      expect(optedOut.size).toBe(0);
      expect(recorded).toHaveLength(1);
      expect(provider.sent).toHaveLength(1);
      expect(provider.sent[0]!.body).toContain(`"${word}"`);
    },
  );

  it.each(['YES', 'START', 'UNSTOP'])(
    '"%s" from an opted-out number opts them back in',
    async (word) => {
      const provider = fakeProvider();
      const { store, optedOut, recorded } = memoryStore();
      await handleInboundText({ provider, store }, inbound('STOP'));
      await handleInboundText({ provider, store }, inbound(word));
      expect(optedOut.has(CUSTOMER)).toBe(false);
      expect(recorded).toHaveLength(0);
      expect(provider.sent).toHaveLength(0);
    },
  );

  it('an "Ok" or "Thanks" is a reply too', async () => {
    const provider = fakeProvider();
    const { store, recorded } = memoryStore();
    await handleInboundText({ provider, store }, inbound('Ok'));
    await handleInboundText({ provider, store }, inbound('Thanks!', 'IN2'));
    expect(recorded.map((r) => r.body)).toEqual(['Ok', 'Thanks!']);
  });

  it('answers HELP for a known customer with the business name, not forwarded, once a day', async () => {
    const provider = fakeProvider();
    const { store, recorded } = memoryStore();
    await handleInboundText({ provider, store }, inbound('HELP'));
    await handleInboundText({ provider, store }, inbound('help', 'IN2'));
    await handleInboundText({ provider, store }, inbound('INFO', 'IN3'));
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ to: CUSTOMER, from: BUSINESS });
    expect(provider.sent[0]!.body).toBe(
      'Green Gulf Lawn: reply STOP to opt out. Msg & data rates may apply.',
    );
    expect(recorded).toHaveLength(0);
  });

  it('does not answer HELP from a number that is not a customer, and does not use up the limit', async () => {
    const provider = fakeProvider();
    const { store } = memoryStore({}, null);
    await handleInboundText({ provider, store }, inbound('HELP'));
    expect(provider.sent).toHaveLength(0);
  });

  it('treats a sentence containing "stop" as an ordinary reply', async () => {
    const provider = fakeProvider();
    const { store, optedOut } = memoryStore();
    await handleInboundText({ provider, store }, inbound('Please stop by tomorrow'));
    expect(optedOut.size).toBe(0);
    expect(provider.sent).toHaveLength(1);
  });
});

describe('inbound webhook', () => {
  const URL_ = 'https://rain-day.example.com/api/sms/inbound';

  it('rejects an unsigned or wrongly signed request before creating the database client', async () => {
    const provider = fakeProvider();
    const getDb = vi.fn(() => {
      throw new Error('must not be called');
    }) as unknown as () => Db;
    const body = JSON.stringify(inbound('STOP'));
    const unsigned = await handleInboundWebhook(new Request(URL_, { method: 'POST', body }), {
      provider,
      getDb,
    });
    const wrong = await handleInboundWebhook(
      new Request(URL_, { method: 'POST', headers: { [FAKE_SIGNATURE_HEADER]: 'forged' }, body }),
      { provider, getDb },
    );
    expect([unsigned.status, wrong.status]).toEqual([403, 403]);
    expect(getDb).not.toHaveBeenCalled();
    expect(provider.sent).toHaveLength(0);
  });

  it('refuses with 500 in production when no public URL is configured', async () => {
    const provider = fakeProvider();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMS_WEBHOOK_PUBLIC_URL', '');
    vi.stubEnv('APP_URL', '');
    try {
      const res = await handleInboundWebhook(
        new Request(URL_, {
          method: 'POST',
          headers: { 'x-forwarded-host': 'evil.example.com' },
          body: 'x',
        }),
        { provider, getDb: (() => undefined) as unknown as () => Db },
      );
      expect(res.status).toBe(500);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
