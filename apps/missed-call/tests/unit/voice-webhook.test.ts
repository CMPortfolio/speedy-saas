import { fakeProvider } from '@speedy/sms/fake';
import type { CallStatusEvent } from '@speedy/sms/provider';
import { TWILIO_SIGNATURE_HEADER, twilioProvider, twilioSignature } from '@speedy/sms/twilio';
import { describe, expect, it, vi } from 'vitest';

import { handleVoiceWebhook } from '../../src/features/missed-calls/voice-webhook';
import type { LineRecord } from '../../src/features/missed-calls/store';
import { memoryStore } from './memory-store';
import { toRequest } from './signed-request';

const line: LineRecord = {
  id: 'line-1',
  providerNumber: '+12395550100',
  ownerCell: '+12395550101',
  ownerCellVerified: true,
  messagingServiceSid: null,
  businessName: 'Gulf Coast Plumbing',
  template: 'Sorry we missed your call. What do you need?',
  afterHoursTemplate: null,
  quietHours: null,
  timezone: 'America/New_York',
};

const URL_ = 'https://missed-call.naplesaiagency.com/api/voice/incoming';
const TOKEN = 'unit-test-auth-token';
const params = {
  CallSid: 'CA00000000000000000000000000000001',
  CallStatus: 'ringing',
  Direction: 'inbound',
  From: '+12395550123',
  To: '+12395550100',
};
const form = new URLSearchParams(params).toString();

function twilioRequest(signature: string | null, body = form) {
  return new Request(URL_, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(signature ? { [TWILIO_SIGNATURE_HEADER]: signature } : {}),
    },
    body,
  });
}

const twilioClient = { messages: { create: vi.fn(async () => ({ sid: 'SM0001' })) } };
const twilio = () =>
  twilioProvider({ accountSid: 'AC' + 'a'.repeat(32), authToken: TOKEN, client: twilioClient });

describe('voice webhook signature', () => {
  it.each([
    ['missing', null],
    ['forged', 'AAAAAAAAAAAAAAAAAAAAAAAAAAA='],
    ['signed with another token', twilioSignature('other-token', URL_, params)],
    ['signed for another url', twilioSignature(TOKEN, URL_ + '2', params)],
  ])('answers 403 and never touches the store or the provider: %s signature', async (_n, sig) => {
    twilioClient.messages.create.mockClear();
    const mem = memoryStore([line]);
    const getStore = vi.fn(() => mem.store);
    const res = await handleVoiceWebhook(twilioRequest(sig), { provider: twilio(), getStore });
    expect(res.status).toBe(403);
    expect(getStore).not.toHaveBeenCalled();
    expect(mem.touched).toBe(0);
    expect(twilioClient.messages.create).not.toHaveBeenCalled();
  });

  it('rejects a valid signature over a tampered body', async () => {
    const mem = memoryStore([line]);
    const sig = twilioSignature(TOKEN, URL_, params);
    const tampered = new URLSearchParams({ ...params, From: '+12395550999' }).toString();
    const res = await handleVoiceWebhook(twilioRequest(sig, tampered), {
      provider: twilio(),
      getStore: () => mem.store,
    });
    expect(res.status).toBe(403);
    expect(mem.touched).toBe(0);
  });

  it('accepts a correctly signed Twilio request: logs the call, texts, answers TwiML', async () => {
    twilioClient.messages.create.mockClear();
    process.env.APP_URL = 'https://missed-call.naplesaiagency.com';
    const mem = memoryStore([line]);
    const res = await handleVoiceWebhook(twilioRequest(twilioSignature(TOKEN, URL_, params)), {
      provider: twilio(),
      getStore: () => mem.store,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/xml');
    expect(await res.text()).toContain('<Say>');
    expect(twilioClient.messages.create).toHaveBeenCalledTimes(1);
    expect(mem.calls).toHaveLength(1);
  });

  it('answers TwiML, not an empty 204, for a status callback it does not act on', async () => {
    const mem = memoryStore([line]);
    const sms = fakeProvider();
    const event: CallStatusEvent = {
      kind: 'call',
      callSid: 'CA9',
      from: '+12395550123',
      to: '+12395550100',
      status: 'completed',
      direction: 'inbound',
    };
    const signed = sms.inbound(event);
    const res = await handleVoiceWebhook(toRequest(signed), {
      provider: sms,
      getStore: () => mem.store,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<Hangup/>');
    expect(mem.touched).toBe(0);
  });

  it.each(['anonymous', '+266696687', '', 'restricted'])(
    'answers a hangup with TwiML, never an empty body, for From=%j',
    async (from) => {
      process.env.APP_URL = 'https://missed-call.naplesaiagency.com';
      const mem = memoryStore([line]);
      const p = { ...params, From: from };
      const res = await handleVoiceWebhook(
        twilioRequest(twilioSignature(TOKEN, URL_, p), new URLSearchParams(p).toString()),
        { provider: twilio(), getStore: () => mem.store },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/xml');
      expect(await res.text()).toContain('<Response>');
      expect(mem.touched).toBe(0);
    },
  );
});
