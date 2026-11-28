import { afterEach, describe, expect, it, vi } from 'vitest';

import { FAKE_SIGNATURE, FAKE_SIGNATURE_HEADER, fakeProvider } from './fake';
import type { CallStatusEvent, DeliveryEvent, InboundMessage } from './provider';
import {
  fromNextRequest,
  handleNextWebhook,
  handleWebhook,
  toResponse,
  WebhookConfigError,
} from './webhook';

const inbound: InboundMessage = {
  kind: 'inbound',
  from: '+12395550123',
  to: '+12395550100',
  body: 'Can you come today?',
  providerMessageId: 'FAKE-IN-1',
};
const call: CallStatusEvent = {
  kind: 'call',
  callSid: 'FAKE-CALL-1',
  from: '+12395550123',
  to: '+12395550100',
  status: 'no-answer',
  direction: 'inbound',
};
const delivery: DeliveryEvent = { kind: 'delivery', providerMessageId: 'FAKE0001', status: 'sent' };

describe('handleWebhook', () => {
  it('rejects an unsigned request with 403 and never calls a handler', async () => {
    const p = fakeProvider();
    const onInbound = vi.fn();
    const req = p.inbound(inbound);
    req.headers = {};
    const res = await handleWebhook(p, req, { onInbound });
    expect(res).toEqual({
      status: 403,
      body: 'Forbidden',
      contentType: 'text/plain; charset=utf-8',
    });
    expect(onInbound).not.toHaveBeenCalled();
  });

  it('rejects a forged signature with 403 before parsing the body', async () => {
    const p = fakeProvider();
    const parse = vi.spyOn(p, 'parseInbound');
    const req = p.inbound(inbound);
    req.headers[FAKE_SIGNATURE_HEADER] = 'forged';
    const res = await handleWebhook(p, req, {});
    expect(res.status).toBe(403);
    expect(parse).not.toHaveBeenCalled();
  });

  it('dispatches an inbound text and answers 204 when the handler returns nothing', async () => {
    const p = fakeProvider();
    const onInbound = vi.fn();
    const res = await handleWebhook(p, p.inbound(inbound), { onInbound });
    expect(onInbound).toHaveBeenCalledWith(inbound);
    expect(res.status).toBe(204);
    expect(res.body).toBe('');
  });

  it('dispatches a call event and returns the handler TwiML as text/xml', async () => {
    const p = fakeProvider();
    const onCallStatus = vi.fn(async () => '<Response><Hangup/></Response>');
    const res = await handleWebhook(p, p.inbound(call), { onCallStatus });
    expect(onCallStatus).toHaveBeenCalledWith(call);
    expect(res).toEqual({
      status: 200,
      body: '<Response><Hangup/></Response>',
      contentType: 'text/xml; charset=utf-8',
    });
  });

  it('dispatches a delivery event', async () => {
    const p = fakeProvider();
    const onDelivery = vi.fn();
    await handleWebhook(p, p.inbound(delivery), { onDelivery });
    expect(onDelivery).toHaveBeenCalledWith(delivery);
  });

  it('answers 204 for an event with no handler registered', async () => {
    const p = fakeProvider();
    const res = await handleWebhook(p, p.inbound(delivery), {});
    expect(res.status).toBe(204);
  });

  it('answers 400 for a signed but unparseable body', async () => {
    const p = fakeProvider();
    const req = p.inbound(inbound);
    req.rawBody = 'garbage';
    const res = await handleWebhook(p, req, {});
    expect(res.status).toBe(400);
  });

  it('answers 204 for events the provider says to ignore', async () => {
    const p = fakeProvider();
    vi.spyOn(p, 'parseInbound').mockReturnValue({
      ok: false,
      error: { code: 'ignored_event', message: 'skip' },
    });
    const res = await handleWebhook(p, p.inbound(inbound), {});
    expect(res.status).toBe(204);
  });

  it('answers 500 and does not throw when a handler throws', async () => {
    const p = fakeProvider();
    const res = await handleWebhook(p, p.inbound(inbound), {
      onInbound: () => {
        throw new Error('db down');
      },
    });
    expect(res.status).toBe(500);
  });
});

describe('fromNextRequest', () => {
  function request(url: string, headers: Record<string, string> = {}): Request {
    return new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: 'From=%2B12395550123&Body=hi',
    });
  }

  it('reads the raw body and lowercases headers', async () => {
    const req = await fromNextRequest(
      request('http://127.0.0.1:3001/api/sms/inbound', { 'X-Twilio-Signature': 'abc' }),
      { publicUrl: undefined },
    );
    expect(req.rawBody).toBe('From=%2B12395550123&Body=hi');
    expect(req.headers['x-twilio-signature']).toBe('abc');
  });

  it('rewrites the origin to the public URL and keeps path and query', async () => {
    const req = await fromNextRequest(request('http://10.0.0.5:8080/api/sms/inbound?t=1'), {
      publicUrl: 'https://missed-call.naplesaiagency.com',
    });
    expect(req.url).toBe('https://missed-call.naplesaiagency.com/api/sms/inbound?t=1');
  });

  it('falls back to X-Forwarded-Proto and X-Forwarded-Host behind a proxy', async () => {
    vi.stubEnv('SMS_WEBHOOK_PUBLIC_URL', '');
    vi.stubEnv('APP_URL', '');
    const req = await fromNextRequest(
      request('http://10.0.0.5:8080/api/voice/incoming', {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'missed-call.naplesaiagency.com',
      }),
    );
    expect(req.url).toBe('https://missed-call.naplesaiagency.com/api/voice/incoming');
    vi.unstubAllEnvs();
  });

  it('uses SMS_WEBHOOK_PUBLIC_URL from the environment when no option is passed', async () => {
    vi.stubEnv('SMS_WEBHOOK_PUBLIC_URL', 'https://public.example');
    const req = await fromNextRequest(request('http://127.0.0.1:3001/api/sms/status'));
    expect(req.url).toBe('https://public.example/api/sms/status');
    vi.unstubAllEnvs();
  });
});

describe('end to end with a web Request', () => {
  it('a route handler is one line: handleWebhook + fromNextRequest + toResponse', async () => {
    const p = fakeProvider();
    const seen: InboundMessage[] = [];
    const route = async (request: Request) =>
      toResponse(
        await handleWebhook(p, await fromNextRequest(request, { publicUrl: 'http://localhost' }), {
          onInbound: (m) => {
            seen.push(m);
          },
        }),
      );
    const good = await route(
      new Request('http://localhost/api/sms/inbound', {
        method: 'POST',
        headers: { [FAKE_SIGNATURE_HEADER]: FAKE_SIGNATURE },
        body: JSON.stringify(inbound),
      }),
    );
    expect(good.status).toBe(204);
    expect(seen).toEqual([inbound]);

    const forged = await route(
      new Request('http://localhost/api/sms/inbound', {
        method: 'POST',
        body: JSON.stringify(inbound),
      }),
    );
    expect(forged.status).toBe(403);
    expect(await forged.text()).toBe('Forbidden');
    expect(seen).toHaveLength(1);
  });
});

describe('signing URL in production', () => {
  const forwarded = {
    'x-forwarded-proto': 'https',
    'x-forwarded-host': 'attacker.example',
  };
  const post = (headers: Record<string, string> = {}) =>
    new Request('http://10.0.0.5:8080/api/voice/incoming', {
      method: 'POST',
      headers,
      body: 'x=1',
    });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['NODE_ENV=production', { NODE_ENV: 'production' }],
    ['RAILWAY_ENVIRONMENT set', { NODE_ENV: 'development', RAILWAY_ENVIRONMENT: 'production' }],
  ])('refuses to build the URL from X-Forwarded-Host with no public URL: %s', async (_n, env) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.stubEnv('SMS_WEBHOOK_PUBLIC_URL', '');
    vi.stubEnv('APP_URL', '');
    await expect(fromNextRequest(post(forwarded))).rejects.toBeInstanceOf(WebhookConfigError);
  });

  it('answers 500 and never calls a handler when production has no public URL', async () => {
    const p = fakeProvider(); // built before the environment turns production-like
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMS_WEBHOOK_PUBLIC_URL', '');
    vi.stubEnv('APP_URL', '');
    const onInbound = vi.fn();
    const signed = p.inbound(inbound);
    const res = await handleNextWebhook(
      p,
      new Request('http://10.0.0.5:8080/api/sms/inbound', {
        method: 'POST',
        headers: { ...signed.headers, ...forwarded } as Record<string, string>,
        body: signed.rawBody,
      }),
      { onInbound },
    );
    expect(res.status).toBe(500);
    expect(onInbound).not.toHaveBeenCalled();
  });

  it('uses APP_URL in production and ignores X-Forwarded-Host', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMS_WEBHOOK_PUBLIC_URL', '');
    vi.stubEnv('APP_URL', 'https://missed-call.naplesaiagency.com');
    const req = await fromNextRequest(post(forwarded));
    expect(req.url).toBe('https://missed-call.naplesaiagency.com/api/voice/incoming');
  });

  it('still derives the URL from forwarded headers outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SMS_WEBHOOK_PUBLIC_URL', '');
    vi.stubEnv('APP_URL', '');
    const req = await fromNextRequest(
      post({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'tunnel.example' }),
    );
    expect(req.url).toBe('https://tunnel.example/api/voice/incoming');
  });
});
