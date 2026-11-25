import { authEnvSchema } from '@speedy/auth/env';
import { createEnv, envHelpers } from '@speedy/lib/env';
import { smsEnvSchema } from '@speedy/sms/env';
import { z } from 'zod';

/**
 * This tool's environment. Server vars are never readable in the browser; client vars must
 * start with NEXT_PUBLIC_. Add the tool's own variables here and to .env.example.
 */
export const env = createEnv({
  server: {
    ...authEnvSchema.server,
    ...smsEnvSchema.server,
    /** The business texting number, E.164. Twilio ignores it when a Messaging Service is set. */
    SMS_FROM_NUMBER: z
      .string()
      .regex(/^\+1[2-9][0-9]{9}$/, 'a US number like +12395550100')
      .optional(),
    APP_URL: z.url().default('http://localhost:3003'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    NODE_ENV: envHelpers.nodeEnv,
  },
  client: { ...authEnvSchema.client },
  skipValidation: process.env.SKIP_ENV_VALIDATION === '1',
});
