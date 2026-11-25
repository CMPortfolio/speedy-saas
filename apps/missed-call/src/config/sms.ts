import { createSmsProvider, SmsConfigError } from '@speedy/sms/create';
import type { SmsProvider } from '@speedy/sms/provider';

import { env } from './env';
import { webhookUrlProblem } from './webhook-url';

let provider: SmsProvider | undefined;

/**
 * The app's one SMS provider: Twilio in production, the fake provider in development and tests.
 * Created on first use rather than at import, so `next build` needs no Twilio credentials;
 * a production start with SMS_PROVIDER=fake, missing credentials or no SMS_WEBHOOK_PUBLIC_URL
 * fails on the first webhook.
 */
export function getSms(): SmsProvider {
  if (!provider) {
    const problem = webhookUrlProblem({
      smsProvider: env.SMS_PROVIDER,
      nodeEnv: env.NODE_ENV,
      publicUrl: env.SMS_WEBHOOK_PUBLIC_URL,
    });
    if (problem) throw new SmsConfigError(problem);
    provider = createSmsProvider(env);
  }
  return provider;
}
