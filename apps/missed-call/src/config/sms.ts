import { createSmsProvider, SmsConfigError } from '@speedy/sms/create';
import type { SmsProvider } from '@speedy/sms/provider';

import { env } from './env';
import { webhookUrlProblem } from './webhook-url';

/**
 * Next can bundle the route handlers and the server actions separately, which would give each its
 * own copy of this module. One provider per process is kept on globalThis so they all share it
 * (the fake provider's sent texts have to be visible to the dev route that reads them).
 */
const globalForSms = globalThis as typeof globalThis & { __missedCallSms?: SmsProvider };

/**
 * The app's one SMS provider: Twilio in production, the fake provider in development and tests.
 * Created on first use rather than at import, so `next build` needs no Twilio credentials;
 * a production start with SMS_PROVIDER=fake, missing credentials or no SMS_WEBHOOK_PUBLIC_URL
 * fails on the first webhook.
 */
export function getSms(): SmsProvider {
  if (!globalForSms.__missedCallSms) {
    const problem = webhookUrlProblem({
      smsProvider: env.SMS_PROVIDER,
      nodeEnv: env.NODE_ENV,
      publicUrl: env.SMS_WEBHOOK_PUBLIC_URL,
    });
    if (problem) throw new SmsConfigError(problem);
    globalForSms.__missedCallSms = createSmsProvider(env);
  }
  return globalForSms.__missedCallSms;
}
