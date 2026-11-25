/**
 * Scheduled cleanup, run by a Railway cron service (`0 8 * * *`):
 *   pnpm --filter @speedy/job-photos cleanup
 * Deletes anonymous jobs past their 30-day expiry and their photos from storage. Exits 1 if
 * any job could not be cleaned so Railway shows the run as failed.
 */
import type { Database } from '@speedy/db/types';
import { logger } from '@speedy/lib/logger';
import { supabaseStorage } from '@speedy/lib/photos';
import { createClient } from '@supabase/supabase-js';

import { STORAGE_BUCKET } from '../src/config/constants';
import { cleanupExpiredJobs, supabaseCleanupStore } from '../src/features/cleanup/cleanup';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`cleanup: ${name} is not set`);
    process.exit(1);
  }
  return value;
}

const client = createClient<Database>(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const log = logger.child({ script: 'cleanup' });
const result = await cleanupExpiredJobs({
  store: supabaseCleanupStore(client),
  storage: supabaseStorage(client, STORAGE_BUCKET),
  onError: (jobId, error) => log.error('cleanup failed for job', { jobId, error }),
});
log.info('cleanup finished', { ...result });
process.exit(result.failures > 0 ? 1 : 0);
