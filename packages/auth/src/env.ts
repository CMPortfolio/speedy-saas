import { createEnv } from '@speedy/lib/env';
import { z } from 'zod';

/**
 * Auth env. Every tool shares these; the template's config/env.ts spreads them in.
 * AUTH_COOKIE_DOMAIN is ".naplesaiagency.com" in production so one sign-in works across tools.
 */
export const authEnvSchema = {
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    AUTH_COOKIE_DOMAIN: z
      .string()
      .trim()
      .regex(/^\.?[a-z0-9.-]+$/i, 'a hostname like .naplesaiagency.com')
      .optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
} as const;

export const authEnv = createEnv(authEnvSchema);
