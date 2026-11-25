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

function memoryStore(overrides: Partial<RecordedReply> = {}) {
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
    async businessNameFor() {
      return 'Green Gulf Lawn';
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

  it('STOP opts the number out and START clears it, with nothing forwarded or recorded', async () => {
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

  it('answers HELP with the business name and does not forward it', async () => {
    const provider = fakeProvider();
    const { store, recorded } = memoryStore();
    await handleInboundText({ provider, store }, inbound('HELP'));
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ to: CUSTOMER, from: BUSINESS });
    expect(provider.sent[0]!.body).toBe(
      'Green Gulf Lawn: reply STOP to opt out. Msg & data rates may apply.',
    );
    expect(recorded).toHaveLength(0);
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
});
