import { describe, expect, it } from 'vitest';

import { createEmailClient, isResendTestAddress } from './email';

describe('email client guard', () => {
  it('recognises Resend test addresses', () => {
    expect(isResendTestAddress('delivered@resend.dev')).toBe(true);
    expect(isResendTestAddress('Bounced@Resend.dev')).toBe(true);
    expect(isResendTestAddress('someone@gmail.com')).toBe(false);
  });

  it('blocks real addresses outside production and allows them in production', async () => {
    const dev = createEmailClient({ from: 'Test <t@resend.dev>', isProduction: false });
    expect(dev.isAllowed('owner@example.com')).toBe(false);
    expect(dev.isAllowed('delivered@resend.dev')).toBe(true);
    const r = await dev.send({ to: 'owner@example.com', subject: 's', html: '<p>x</p>' });
    expect(!r.ok && r.error.code).toBe('email_blocked');

    const allow = createEmailClient({
      from: 'x',
      isProduction: false,
      allowlist: ['me@example.com'],
    });
    expect(allow.isAllowed('ME@example.com')).toBe(true);

    const prod = createEmailClient({ from: 'x', isProduction: true });
    expect(prod.isAllowed('owner@example.com')).toBe(true);
  });

  it('skips sending without an API key instead of failing', async () => {
    const dev = createEmailClient({ from: 'x', isProduction: false });
    const r = await dev.send({ to: 'delivered@resend.dev', subject: 's', html: '<p>x</p>' });
    expect(r).toEqual({ ok: true, value: { id: null } });
  });
});
