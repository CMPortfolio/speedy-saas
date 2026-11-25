import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createEnv } from '@speedy/lib/env';

import { createSmsProvider, SmsConfigError } from './create';
import { smsEnvSchema } from './env';

function parse(runtimeEnv: Record<string, string>) {
  return createEnv({ server: { ...smsEnvSchema.server }, runtimeEnv });
}

describe('smsEnvSchema', () => {
  it('defaults SMS_PROVIDER to fake and leaves the Twilio vars optional', () => {
    const env = parse({});
    expect(env.SMS_PROVIDER).toBe('fake');
    expect(env.TWILIO_ACCOUNT_SID).toBeUndefined();
    expect(env.TWILIO_MESSAGING_SERVICE_SID).toBeUndefined();
  });

  it('rejects an unknown provider and a malformed Account SID', () => {
    expect(() => parse({ SMS_PROVIDER: 'carrier-pigeon' })).toThrow(/SMS_PROVIDER/);
    expect(() => parse({ TWILIO_ACCOUNT_SID: 'not-a-sid' })).toThrow(/TWILIO_ACCOUNT_SID/);
  });

  it('accepts a full Twilio configuration', () => {
    const env = parse({
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
      TWILIO_AUTH_TOKEN: 'test-token',
      TWILIO_MESSAGING_SERVICE_SID: 'MG00000000000000000000000000000000',
      SMS_WEBHOOK_PUBLIC_URL: 'https://missed-call.naplesaiagency.com',
    });
    expect(env.SMS_PROVIDER).toBe('twilio');
    expect(z.url().safeParse(env.SMS_WEBHOOK_PUBLIC_URL).success).toBe(true);
  });
});

describe('createSmsProvider', () => {
  const twilioEnv = parse({
    SMS_PROVIDER: 'twilio',
    TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
    TWILIO_AUTH_TOKEN: 'test-token',
  });

  it('returns the fake provider outside production', () => {
    expect(createSmsProvider(parse({}), { nodeEnv: 'development' }).name).toBe('fake');
    expect(createSmsProvider(parse({}), { nodeEnv: 'test' }).name).toBe('fake');
  });

  it('refuses the fake provider in production', () => {
    expect(() => createSmsProvider(parse({}), { nodeEnv: 'production' })).toThrow(SmsConfigError);
    expect(() =>
      createSmsProvider(parse({ SMS_PROVIDER: 'fake' }), { nodeEnv: 'production' }),
    ).toThrow(/not allowed in production/);
  });

  it('refuses twilio without credentials', () => {
    expect(() =>
      createSmsProvider(parse({ SMS_PROVIDER: 'twilio' }), { nodeEnv: 'production' }),
    ).toThrow(/TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN/);
  });

  it('builds the Twilio provider when configured', () => {
    const client = {
      messages: { create: async () => ({ sid: 'SM0000000000000000000000000000eeee' }) },
    };
    const p = createSmsProvider(twilioEnv, { nodeEnv: 'production', twilioClient: client });
    expect(p.name).toBe('twilio');
  });
});

describe('createSmsProvider on Railway', () => {
  it('refuses the fake provider when RAILWAY_ENVIRONMENT is set, whatever NODE_ENV says', () => {
    vi.stubEnv('RAILWAY_ENVIRONMENT', 'production');
    expect(() => createSmsProvider(parse({}), { nodeEnv: 'development' })).toThrow(SmsConfigError);
    vi.unstubAllEnvs();
  });
});
