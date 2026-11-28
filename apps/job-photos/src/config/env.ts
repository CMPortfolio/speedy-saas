import { authEnvSchema } from '@speedy/auth/env';
import { createEnv, envHelpers } from '@speedy/lib/env';
import { z } from 'zod';

/**
 * This tool's environment. Server vars are never readable in the browser; client vars must
 * start with NEXT_PUBLIC_. Add the tool's own variables here and to .env.example.
 */
export const env = createEnv({
  server: {
    ...authEnvSchema.server,
    APP_URL: z.url().default('http://localhost:3001'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    NODE_ENV: envHelpers.nodeEnv,
    /** Shared secret for POST /api/cron/cleanup. Unset means the route refuses everyone. */
    CRON_SECRET: z.string().min(16).optional(),
    /** Where photos go. "memory" is for development only; see lib/storage-driver.ts. */
    STORAGE_DRIVER: z.enum(['supabase', 'memory']).default('supabase'),
  },
  client: { ...authEnvSchema.client },
  skipValidation: process.env.SKIP_ENV_VALIDATION === '1',
});
