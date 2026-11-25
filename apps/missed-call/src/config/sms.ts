import type { SmsProvider } from '@speedy/sms/provider';
import { createSmsProvider } from '@speedy/sms/create';

import { env } from './env';

let provider: SmsProvider | undefined;

/**
 * The app's one SMS provider: Twilio in production, the fake provider in development and tests.
 * Created on first use rather than at import, so `next build` needs no Twilio credentials;
 * a production start with SMS_PROVIDER=fake or missing credentials fails on the first webhook.
 */
export function getSms(): SmsProvider {
  provider ??= createSmsProvider(env);
  return provider;
}
