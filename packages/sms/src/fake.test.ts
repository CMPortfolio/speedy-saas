import { afterEach, describe, expect, it, vi } from 'vitest';

import { appError } from '@speedy/lib/result';

import { FAKE_SIGNATURE_HEADER, fakeProvider } from './fake';

describe('fakeProvider', () => {
  it('records every send with a stable fake id', async () => {
    const p = fakeProvider();
    const r1 = await p.sendText({ to: '+12395550123', from: '+12395550100', body: 'one' });
    const r2 = await p.sendText({ to: '+12395550124', from: '+12395550100', body: 'two' });
    expect(r1).toEqual({ ok: true, value: { providerMessageId: 'FAKE0001' } });
    expect(r2.ok && r2.value.providerMessageId).toBe('FAKE0002');
    expect(p.sent.map((s) => s.body)).toEqual(['one', 'two']);
    expect(p.sent[0]?.sentAt).toBeInstanceOf(Date);
  });

  it('lets a test inject an inbound text and a call event', () => {
    const p = fakeProvider();
    const req = p.inbound({
      kind: 'inbound',
      from: '+12395550123',
      to: '+12395550100',
      body: 'On my way',
      providerMessageId: 'FAKE-IN-1',
    });
    expect(p.verifySignature(req)).toBe(true);
    expect(p.parseInbound(req)).toEqual({
      ok: true,
      value: {
        kind: 'inbound',
        from: '+12395550123',
        to: '+12395550100',
        body: 'On my way',
        providerMessageId: 'FAKE-IN-1',
      },
    });
    const call = p.inbound({
      kind: 'call',
      callSid: 'FAKE-CALL-1',
      from: '+12395550123',
      to: '+12395550100',
      status: 'no-answer',
      direction: 'inbound',
    });
    const r = p.parseInbound(call);
    expect(r.ok && r.value.kind === 'call' && r.value.status).toBe('no-answer');
  });

  it('accepts only the fixed test signature header', () => {
    const p = fakeProvider();
    const req = p.inbound({ kind: 'delivery', providerMessageId: 'x', status: 'sent' });
    expect(p.verifySignature(req)).toBe(true);
    expect(p.verifySignature({ ...req, headers: { [FAKE_SIGNATURE_HEADER]: 'nope' } })).toBe(false);
    expect(p.verifySignature({ ...req, headers: {} })).toBe(false);
  });

  it('rejects bodies that are not fake events', () => {
    const p = fakeProvider();
    const bad = p.parseInbound({ headers: {}, rawBody: 'not json', url: 'http://x' });
    expect(!bad.ok && bad.error.code).toBe('invalid_webhook');
    const unknown = p.parseInbound({ headers: {}, rawBody: '{"kind":"other"}', url: 'http://x' });
    expect(!unknown.ok && unknown.error.code).toBe('invalid_webhook');
  });

  it('can fail the next send once, then reset', async () => {
    const p = fakeProvider();
    p.failNext(appError('provider_failed', 'down'));
    const r = await p.sendText({ to: '+12395550123', from: '+12395550100', body: 'x' });
    expect(!r.ok && r.error.code).toBe('provider_failed');
    const r2 = await p.sendText({ to: '+12395550123', from: '+12395550100', body: 'y' });
    expect(r2.ok).toBe(true);
    expect(p.sent).toHaveLength(1);
    p.reset();
    expect(p.sent).toHaveLength(0);
  });
});

describe('fakeProvider guard', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('refuses to be built when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => fakeProvider()).toThrow(/not allowed in production/);
  });

  it('refuses to be built on Railway, even with ALLOW_FAKE_SMS=1', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RAILWAY_ENVIRONMENT', 'production');
    expect(() => fakeProvider()).toThrow(/deployed/);
    vi.stubEnv('ALLOW_FAKE_SMS', '1');
    expect(() => fakeProvider()).toThrow(/deployed/);
  });

  it('can be built for a local production run with ALLOW_FAKE_SMS=1 and a local APP_URL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_FAKE_SMS', '1');
    vi.stubEnv('APP_URL', 'http://localhost:3002');
    expect(fakeProvider().name).toBe('fake');
  });

  it('refuses even with ALLOW_FAKE_SMS=1 when APP_URL is a real domain', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_FAKE_SMS', '1');
    vi.stubEnv('APP_URL', 'https://missed-call.naplesaiagency.com');
    expect(() => fakeProvider()).toThrow(/APP_URL/);
  });
});
