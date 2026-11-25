import { z } from 'zod';

/**
 * SMS env. Tools spread `smsEnvSchema.server` into their createEnv() like the auth schema.
 * `SMS_PROVIDER` defaults to `fake` so development and tests never text a real number;
 * `createSmsProvider` (./create) refuses `fake` in production.
 */
export const smsEnvSchema = {
  server: {
    SMS_PROVIDER: z.enum(['twilio', 'fake']).default('fake'),
    TWILIO_ACCOUNT_SID: z
      .string()
      .regex(/^AC[0-9a-f]{32}$/i, 'an Account SID like AC… (34 chars)')
      .optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    TWILIO_MESSAGING_SERVICE_SID: z
      .string()
      .regex(/^MG[0-9a-f]{32}$/i, 'a Messaging Service SID like MG… (34 chars)')
      .optional(),
    /** Public origin webhooks are signed against, when it differs from APP_URL. */
    SMS_WEBHOOK_PUBLIC_URL: z.url().optional(),
  },
} as const;

export type SmsEnv = z.infer<z.ZodObject<typeof smsEnvSchema.server>>;
