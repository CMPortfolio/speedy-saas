import type { Db } from '@speedy/db/core';
import { fakeProvider, FAKE_SIGNATURE_HEADER } from '@speedy/sms/fake';
import { twilioProvider, twilioSignature, parseFormBody } from '@speedy/sms/twilio';
import { describe, expect, it, vi } from 'vitest';

import { handleStatusWebhook } from '@/features/rain-day/status-webhook';

const URL_ = 'https://rain-day.example.com/api/sms/status';

/** A db whose every use fails the test: a forged webhook must never reach it. */
function untouchableDb() {
  const getDb = vi.fn(() => {
    throw new Error('db must not be created for an unsigned request');
  });
  return getDb as unknown as () => Db;
}

function updateSpyDb() {
  const calls: { patch: unknown; filters: unknown[] }[] = [];
  const builder = (patch: unknown) => {
    const call = { patch, filters: [] as unknown[] };
    calls.push(call);
    const chain = {
      eq: (...a: unknown[]) => (call.filters.push(['eq', ...a]), chain),
      in: (...a: unknown[]) => (call.filters.push(['in', ...a]), chain),
      select: async () => ({ data: [{ id: 'm1' }], error: null }),
    };
    return chain;
  };
  const db = { schema: () => ({ from: () => ({ update: builder }) }) } as unknown as Db;
  return { db, calls };
}

describe('status webhook', () => {
  it('rejects an unsigned request with 403 before touching the database', async () => {
    const provider = fakeProvider();
    const getDb = untouchableDb();
    const res = await handleStatusWebhook(
      new Request(URL_, {
        method: 'POST',
        body: JSON.stringify({
          kind: 'delivery',
          providerMessageId: 'FAKE0001',
          status: 'delivered',
        }),
      }),
      { provider, getDb },
    );
    expect(res.status).toBe(403);
    expect(getDb).not.toHaveBeenCalled();
  });

  it('rejects a wrong signature', async () => {
    const provider = fakeProvider();
    const res = await handleStatusWebhook(
      new Request(URL_, {
        method: 'POST',
        headers: { [FAKE_SIGNATURE_HEADER]: 'forged' },
        body: JSON.stringify({
          kind: 'delivery',
          providerMessageId: 'FAKE0001',
          status: 'delivered',
        }),
      }),
      { provider, getDb: untouchableDb() },
    );
    expect(res.status).toBe(403);
  });

  it('rejects a forged Twilio post and accepts a correctly signed one', async () => {
    const provider = twilioProvider({
      accountSid: 'AC00000000000000000000000000000000',
      authToken: 'test-token',
    });
    const body = 'MessageSid=SM0001&MessageStatus=delivered';
    const forged = await handleStatusWebhook(
      new Request(URL_, {
        method: 'POST',
        headers: {
          'x-twilio-signature': 'nope',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      }),
      { provider, getDb: untouchableDb() },
    );
    expect(forged.status).toBe(403);

    const { db, calls } = updateSpyDb();
    const signature = twilioSignature('test-token', URL_, parseFormBody(body));
    const ok = await handleStatusWebhook(
      new Request(URL_, {
        method: 'POST',
        headers: {
          'x-twilio-signature': signature,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      }),
      { provider, getDb: () => db },
    );
    expect(ok.status).toBe(204);
    expect(calls).toHaveLength(1);
  });
});

describe('status webhook: applying events', () => {
  it('applies a signed delivery event only to the matching message and only moving forward', async () => {
    const provider = fakeProvider();
    const { db, calls } = updateSpyDb();
    const signed = provider.inbound({
      kind: 'delivery',
      providerMessageId: 'FAKE0007',
      status: 'delivered',
    });
    const res = await handleStatusWebhook(
      new Request(URL_, {
        method: 'POST',
        headers: signed.headers as Record<string, string>,
        body: signed.rawBody,
      }),
      { provider, getDb: () => db },
    );
    expect(res.status).toBe(204);
    expect(calls[0]!.patch).toEqual({ status: 'delivered' });
    expect(calls[0]!.filters).toEqual([
      ['eq', 'provider_message_id', 'FAKE0007'],
      ['in', 'status', ['queued', 'sent']],
    ]);
  });

  it('records the provider error code on a failed text', async () => {
    const provider = fakeProvider();
    const { db, calls } = updateSpyDb();
    const signed = provider.inbound({
      kind: 'delivery',
      providerMessageId: 'FAKE0008',
      status: 'undelivered',
      errorCode: '30003',
    });
    await handleStatusWebhook(
      new Request(URL_, {
        method: 'POST',
        headers: signed.headers as Record<string, string>,
        body: signed.rawBody,
      }),
      { provider, getDb: () => db },
    );
    expect(calls[0]!.patch).toEqual({ status: 'failed', error_code: '30003' });
  });

  it('does nothing for a "queued" event', async () => {
    const provider = fakeProvider();
    const { db, calls } = updateSpyDb();
    const signed = provider.inbound({
      kind: 'delivery',
      providerMessageId: 'FAKE0009',
      status: 'queued',
    });
    const res = await handleStatusWebhook(
      new Request(URL_, {
        method: 'POST',
        headers: signed.headers as Record<string, string>,
        body: signed.rawBody,
      }),
      { provider, getDb: () => db },
    );
    expect(res.status).toBe(204);
    expect(calls).toHaveLength(0);
  });
});
