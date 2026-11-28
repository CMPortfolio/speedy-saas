import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { WebhookRequest } from './provider';
import {
  parseTwilioWebhook,
  twilioProvider,
  twilioSignature,
  twimlHangup,
  twimlSay,
  verifyTwilioSignature,
} from './twilio';

// Obviously fake credentials. Never put real ones here.
const AUTH_TOKEN = 'test-token';
const ACCOUNT_SID = 'AC00000000000000000000000000000000';
const URL = 'https://missed-call.naplesaiagency.com/api/sms/inbound';

/** Hand-written realistic Twilio payloads (form-encoded, the way Twilio posts them). */
const fixtures = {
  inbound: new URLSearchParams({
    ToCountry: 'US',
    ToState: 'FL',
    SmsMessageSid: 'SM0000000000000000000000000000aaaa',
    NumMedia: '0',
    SmsSid: 'SM0000000000000000000000000000aaaa',
    SmsStatus: 'received',
    Body: 'Hi, my AC stopped cooling. Can you come today?',
    To: '+12395550100',
    NumSegments: '1',
    MessageSid: 'SM0000000000000000000000000000aaaa',
    AccountSid: ACCOUNT_SID,
    From: '+12395550123',
    ApiVersion: '2010-04-01',
  }).toString(),
  callNoAnswer: new URLSearchParams({
    AccountSid: ACCOUNT_SID,
    ApiVersion: '2010-04-01',
    CallSid: 'CA0000000000000000000000000000bbbb',
    CallStatus: 'no-answer',
    Called: '+12395550100',
    Caller: '+12395550123',
    Direction: 'inbound',
    From: '+12395550123',
    To: '+12395550100',
    Duration: '0',
    Timestamp: 'Tue, 25 Nov 2026 14:03:11 +0000',
  }).toString(),
  delivery: new URLSearchParams({
    AccountSid: ACCOUNT_SID,
    ApiVersion: '2010-04-01',
    From: '+12395550100',
    MessageSid: 'SM0000000000000000000000000000cccc',
    MessageStatus: 'delivered',
    SmsSid: 'SM0000000000000000000000000000cccc',
    SmsStatus: 'delivered',
    To: '+12395550123',
  }).toString(),
};

/** Independent reference implementation of Twilio's algorithm, so the test does not trust ours. */
function referenceSignature(token: string, url: string, body: string): string {
  const entries = [...new URLSearchParams(body)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const data = entries.reduce((acc, [k, v]) => acc + k + v, url);
  return createHmac('sha1', token).update(data, 'utf8').digest('base64');
}

function signed(body: string, url = URL, token = AUTH_TOKEN): WebhookRequest {
  return {
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': referenceSignature(token, url, body),
    },
    rawBody: body,
    url,
  };
}

describe('Twilio signature', () => {
  it('matches the reference HMAC-SHA1 over url + sorted params', () => {
    const params = Object.fromEntries(new URLSearchParams(fixtures.inbound));
    expect(twilioSignature(AUTH_TOKEN, URL, params)).toBe(
      referenceSignature(AUTH_TOKEN, URL, fixtures.inbound),
    );
  });

  it('accepts a correctly signed request', () => {
    expect(verifyTwilioSignature(AUTH_TOKEN, signed(fixtures.inbound))).toBe(true);
  });

  it('rejects a tampered body', () => {
    const req = signed(fixtures.inbound);
    req.rawBody = req.rawBody.replace('stopped+cooling', 'is+fine');
    expect(verifyTwilioSignature(AUTH_TOKEN, req)).toBe(false);
  });

  it('rejects a missing header', () => {
    const req = signed(fixtures.inbound);
    delete req.headers['X-Twilio-Signature'];
    expect(verifyTwilioSignature(AUTH_TOKEN, req)).toBe(false);
  });

  it('rejects a signature made with another token', () => {
    expect(verifyTwilioSignature(AUTH_TOKEN, signed(fixtures.inbound, URL, 'other-token'))).toBe(
      false,
    );
  });

  it('rejects when the URL differs (different host or query)', () => {
    const req = signed(fixtures.inbound);
    req.url = 'https://evil.example/api/sms/inbound';
    expect(verifyTwilioSignature(AUTH_TOKEN, req)).toBe(false);
  });

  it('accepts the URL with or without the explicit default port', () => {
    const withPort = 'https://missed-call.naplesaiagency.com:443/api/sms/inbound';
    const req = signed(fixtures.inbound, withPort);
    req.url = URL;
    expect(verifyTwilioSignature(AUTH_TOKEN, req)).toBe(true);
  });

  it('covers the query string too', () => {
    const url = `${URL}?tool=missed-call`;
    expect(verifyTwilioSignature(AUTH_TOKEN, signed(fixtures.inbound, url))).toBe(true);
    const req = signed(fixtures.inbound, url);
    req.url = URL;
    expect(verifyTwilioSignature(AUTH_TOKEN, req)).toBe(false);
  });
});

describe('Twilio webhook parsing', () => {
  it('parses an inbound text', () => {
    const r = parseTwilioWebhook(fixtures.inbound);
    expect(r).toEqual({
      ok: true,
      value: {
        kind: 'inbound',
        from: '+12395550123',
        to: '+12395550100',
        body: 'Hi, my AC stopped cooling. Can you come today?',
        providerMessageId: 'SM0000000000000000000000000000aaaa',
      },
    });
  });

  it('parses a missed call (no-answer)', () => {
    const r = parseTwilioWebhook(fixtures.callNoAnswer);
    expect(r).toEqual({
      ok: true,
      value: {
        kind: 'call',
        callSid: 'CA0000000000000000000000000000bbbb',
        from: '+12395550123',
        to: '+12395550100',
        status: 'no-answer',
        direction: 'inbound',
      },
    });
  });

  it('maps Twilio call statuses onto ours and outbound directions', () => {
    const body = fixtures.callNoAnswer
      .replace('CallStatus=no-answer', 'CallStatus=queued')
      .replace('Direction=inbound', 'Direction=outbound-api');
    const r = parseTwilioWebhook(body);
    expect(r.ok && r.value.kind === 'call' && r.value.status).toBe('ringing');
    expect(r.ok && r.value.kind === 'call' && r.value.direction).toBe('outbound');
  });

  it('parses a delivery status', () => {
    const r = parseTwilioWebhook(fixtures.delivery);
    expect(r).toEqual({
      ok: true,
      value: {
        kind: 'delivery',
        providerMessageId: 'SM0000000000000000000000000000cccc',
        status: 'delivered',
      },
    });
  });

  it('keeps the error code on a failed delivery', () => {
    const body = `${fixtures.delivery.replace(/MessageStatus=delivered/, 'MessageStatus=undelivered')}&ErrorCode=30003`;
    const r = parseTwilioWebhook(body);
    expect(r.ok && r.value).toMatchObject({ status: 'undelivered', errorCode: '30003' });
  });

  it('ignores events the tool does not act on (in-progress call, non-US number)', () => {
    const inProgress = fixtures.callNoAnswer.replace(
      'CallStatus=no-answer',
      'CallStatus=in-progress',
    );
    const r1 = parseTwilioWebhook(inProgress);
    expect(!r1.ok && r1.error.code).toBe('ignored_event');
    const foreign = fixtures.inbound.replace('From=%2B12395550123', 'From=%2B447700900123');
    const r2 = parseTwilioWebhook(foreign);
    expect(!r2.ok && r2.error.code).toBe('ignored_event');
  });

  it('rejects a body that is not a Twilio webhook', () => {
    const r = parseTwilioWebhook('hello=world');
    expect(!r.ok && r.error.code).toBe('invalid_webhook');
  });
});

describe('twilioProvider', () => {
  function client(impl?: () => Promise<{ sid: string }>) {
    const create = vi.fn(impl ?? (async () => ({ sid: 'SM0000000000000000000000000000dddd' })));
    return { client: { messages: { create } }, create };
  }

  it('sends through the Messages API with a from number', async () => {
    const { client: c, create } = client();
    const p = twilioProvider({ accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN, client: c });
    const r = await p.sendText({ to: '+12395550123', from: '+12395550100', body: 'Hi' });
    expect(r).toEqual({
      ok: true,
      value: { providerMessageId: 'SM0000000000000000000000000000dddd' },
    });
    expect(create).toHaveBeenCalledWith({ to: '+12395550123', from: '+12395550100', body: 'Hi' });
  });

  it('sends from the number AND the Messaging Service when the send names one', async () => {
    const { client: c, create } = client();
    const p = twilioProvider({ accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN, client: c });
    await p.sendText({
      to: '+12395550123',
      from: '+12395550100',
      body: 'Hi',
      messagingServiceSid: 'MG00000000000000000000000000000000',
    });
    expect(create).toHaveBeenCalledWith({
      to: '+12395550123',
      from: '+12395550100',
      body: 'Hi',
      messagingServiceSid: 'MG00000000000000000000000000000000',
    });
  });

  it('uses a different Messaging Service per send, never one for the whole provider', async () => {
    const { client: c, create } = client();
    const p = twilioProvider({ accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN, client: c });
    const base = { to: '+12395550123' as const, body: 'Hi' };
    await p.sendText({
      ...base,
      from: '+12395550100',
      messagingServiceSid: 'MGaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    await p.sendText({
      ...base,
      from: '+12395550101',
      messagingServiceSid: 'MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    await p.sendText({ ...base, from: '+12395550102' });
    const sentParams = create.mock.calls as unknown as [Record<string, unknown>][];
    expect(sentParams.map(([params]) => [params.from, params.messagingServiceSid])).toEqual([
      ['+12395550100', 'MGaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      ['+12395550101', 'MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
      ['+12395550102', undefined],
    ]);
    expect(sentParams[2]?.[0]).not.toHaveProperty('messagingServiceSid');
  });

  it('adds the status callback when configured', async () => {
    const { client: c, create } = client();
    const p = twilioProvider({
      accountSid: ACCOUNT_SID,
      authToken: AUTH_TOKEN,
      statusCallbackUrl: 'https://missed-call.naplesaiagency.com/api/sms/status',
      client: c,
    });
    await p.sendText({ to: '+12395550123', from: '+12395550100', body: 'Hi' });
    expect(create).toHaveBeenCalledWith({
      to: '+12395550123',
      from: '+12395550100',
      body: 'Hi',
      statusCallback: 'https://missed-call.naplesaiagency.com/api/sms/status',
    });
  });

  it('maps Twilio errors to Result codes instead of throwing', async () => {
    const optedOut = client(async () => {
      throw Object.assign(new Error('blocked'), { code: 21610 });
    });
    const p = twilioProvider({
      accountSid: ACCOUNT_SID,
      authToken: AUTH_TOKEN,
      client: optedOut.client,
    });
    const r = await p.sendText({ to: '+12395550123', from: '+12395550100', body: 'Hi' });
    expect(!r.ok && r.error.code).toBe('opted_out');

    const down = client(async () => {
      throw new Error('503');
    });
    const p2 = twilioProvider({
      accountSid: ACCOUNT_SID,
      authToken: AUTH_TOKEN,
      client: down.client,
    });
    const r2 = await p2.sendText({ to: '+12395550123', from: '+12395550100', body: 'Hi' });
    expect(!r2.ok && r2.error.code).toBe('provider_failed');
  });

  it('verifies and parses through the SmsProvider interface', () => {
    const p = twilioProvider({
      accountSid: ACCOUNT_SID,
      authToken: AUTH_TOKEN,
      client: client().client,
    });
    expect(p.name).toBe('twilio');
    expect(p.verifySignature(signed(fixtures.callNoAnswer))).toBe(true);
    const r = p.parseInbound(signed(fixtures.callNoAnswer));
    expect(r.ok && r.value.kind).toBe('call');
  });
});

describe('TwiML helpers', () => {
  it('twimlHangup ends the call', () => {
    expect(twimlHangup()).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
    );
  });

  it('twimlSay escapes the text and hangs up afterwards', () => {
    expect(twimlSay("Sorry, we're on a job & <busy>")).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we&apos;re on a job &amp; &lt;busy&gt;</Say><Hangup/></Response>',
    );
  });
});
