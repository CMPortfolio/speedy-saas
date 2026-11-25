import { fakeProvider } from '@speedy/sms/fake';
import { TWILIO_SIGNATURE_HEADER, twilioProvider, twilioSignature } from '@speedy/sms/twilio';
import { describe, expect, it, vi } from 'vitest';

import type { LineRecord } from '../../src/features/missed-calls/store';
import { handleInboundSmsWebhook } from '../../src/features/missed-calls/sms-webhook';
import { memoryStore } from './memory-store';
import { toRequest } from './signed-request';

const line: LineRecord = {
  id: 'line-1',
  providerNumber: '+12395550100',
  ownerCell: '+12395550101',
  businessName: 'Gulf Coast Plumbing',
  template: 'Sorry we missed your call.',
  afterHoursTemplate: null,
  quietHours: null,
  timezone: 'America/New_York',
};
const URL_ = 'https://missed-call.naplesaiagency.com/api/sms/inbound';
const TOKEN = 'unit-test-auth-token';
const params = {
  MessageSid: 'SM00000000000000000000000000000001',
  From: '+12395550123',
  To: '+12395550100',
  Body: 'leaking water heater',
};

const client = { messages: { create: vi.fn(async () => ({ sid: 'SM0002' })) } };
const twilio = () =>
  twilioProvider({ accountSid: 'AC' + 'a'.repeat(32), authToken: TOKEN, client });
const request = (signature: string | null) =>
  new Request(URL_, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(signature ? { [TWILIO_SIGNATURE_HEADER]: signature } : {}),
    },
    body: new URLSearchParams(params).toString(),
  });

describe('inbound text webhook', () => {
  it.each([
    ['missing', null],
    ['forged', 'AAAAAAAAAAAAAAAAAAAAAAAAAAA='],
    ['signed with another token', twilioSignature('other', URL_, params)],
  ])('answers 403 and touches nothing: %s signature', async (_n, sig) => {
    client.messages.create.mockClear();
    const mem = memoryStore([line]);
    const getStore = vi.fn(() => mem.store);
    const res = await handleInboundSmsWebhook(request(sig), { provider: twilio(), getStore });
    expect(res.status).toBe(403);
    expect(getStore).not.toHaveBeenCalled();
    expect(mem.touched).toBe(0);
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('accepts a signed text, answers 204 and forwards nothing for a stranger', async () => {
    process.env.APP_URL = 'https://missed-call.naplesaiagency.com';
    const mem = memoryStore([line]);
    const res = await handleInboundSmsWebhook(request(twilioSignature(TOKEN, URL_, params)), {
      provider: twilio(),
      getStore: () => mem.store,
    });
    expect(res.status).toBe(204);
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('forwards a reply end to end through the fake provider', async () => {
    const sms = fakeProvider();
    const mem = memoryStore([line]);
    await mem.store.logMissedCall(line.id, '+12395550123', 'CA1');
    const signed = sms.inbound({
      kind: 'inbound',
      from: '+12395550123',
      to: line.providerNumber,
      body: 'need a quote',
      providerMessageId: 'SMX1',
    });
    const res = await handleInboundSmsWebhook(toRequest(signed), {
      provider: sms,
      getStore: () => mem.store,
    });
    expect(res.status).toBe(204);
    expect(sms.sent[0]?.body).toBe('New lead from (239) 555-0123: need a quote');
  });
});
