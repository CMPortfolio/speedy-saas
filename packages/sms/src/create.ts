import type { SmsEnv } from './env';
import { fakeProvider } from './fake';
import { fakeSmsForbidden } from './guard';
import type { SmsProvider } from './provider';
import { twilioProvider, type TwilioProviderOptions } from './twilio';

/**
 * Pick the provider from env, once at boot. Throws on a config the tool must not run with:
 * `fake` in production, or `twilio` without credentials. Call it from the tool's
 * `src/config/sms.ts` and export the result so every route shares one instance.
 */
export class SmsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmsConfigError';
  }
}

export interface CreateSmsProviderOptions {
  /** Defaults to NODE_ENV. */
  nodeEnv?: string | undefined;
  /** Public URL Twilio posts delivery events to, e.g. `${APP_URL}/api/sms/status`. */
  statusCallbackUrl?: string | undefined;
  /** Test seam: replaces the Twilio SDK client. */
  twilioClient?: TwilioProviderOptions['client'];
}

export function createSmsProvider(
  env: SmsEnv,
  options: CreateSmsProviderOptions = {},
): SmsProvider {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';

  if (env.SMS_PROVIDER === 'fake') {
    const forbidden = fakeSmsForbidden({
      nodeEnv,
      railwayEnvironment: process.env.RAILWAY_ENVIRONMENT,
      allowFakeSms: process.env.ALLOW_FAKE_SMS,
      appUrl: process.env.APP_URL,
    });
    if (forbidden) throw new SmsConfigError(forbidden);
    return fakeProvider();
  }

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new SmsConfigError('SMS_PROVIDER=twilio needs TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }
  return twilioProvider({
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    ...(env.TWILIO_MESSAGING_SERVICE_SID
      ? { messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID }
      : {}),
    ...(options.statusCallbackUrl ? { statusCallbackUrl: options.statusCallbackUrl } : {}),
    ...(options.twilioClient ? { client: options.twilioClient } : {}),
  });
}
