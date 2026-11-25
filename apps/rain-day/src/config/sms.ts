import type { E164 } from '@speedy/lib/phone';
import type { FakeProvider } from '@speedy/sms/fake';
import { createSmsProvider } from '@speedy/sms/create';
import type { SmsProvider } from '@speedy/sms/provider';

import { env } from './env';

/**
 * One provider per server process. Created on first use, not at import, so `next build` does not
 * need texting configured. Cached on globalThis so every route shares the same fake in dev.
 */
const cache = globalThis as { __rainDaySms?: SmsProvider };

export function getSms(): SmsProvider {
  cache.__rainDaySms ??= createSmsProvider(env, {
    statusCallbackUrl: `${new URL(env.SMS_WEBHOOK_PUBLIC_URL ?? env.APP_URL).origin}/api/sms/status`,
  });
  return cache.__rainDaySms;
}

export function isFakeSms(provider: SmsProvider): provider is FakeProvider {
  return provider.name === 'fake';
}

/**
 * A made-up sender for the fake provider in development, so tooling works before an owner has
 * a number. Never used with a real provider: every owner texts from their own number
 * (`rain_day.owner_settings.sender_number`, set by an admin).
 */
export function devDefaultSender(): E164 | null {
  if (env.SMS_PROVIDER !== 'fake') return null;
  return (env.SMS_FROM_NUMBER as E164 | undefined) ?? '+12395550100';
}
