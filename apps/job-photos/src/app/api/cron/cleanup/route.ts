import { createServiceSupabase } from '@speedy/auth/server';
import { logger } from '@speedy/lib/logger';
import { NextResponse } from 'next/server';

import { env } from '@/config/env';
import { cleanupExpiredJobs, supabaseCleanupStore } from '@/features/cleanup/cleanup';
import { isAuthorizedCron } from '@/features/cleanup/cron-auth';
import { handle, jsonError } from '@/lib/http';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/cleanup: deletes expired anonymous jobs and their photos. Guarded by
 * CRON_SECRET (`Authorization: Bearer <secret>`); anything else is 401. The scheduled run on
 * Railway uses `pnpm --filter @speedy/job-photos cleanup` instead; this route is for a manual
 * or external trigger.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isAuthorizedCron(request, env.CRON_SECRET))) {
    return jsonError(401, 'unauthorized', 'Not allowed.');
  }
  return handle('POST /api/cron/cleanup', async () => {
    const log = logger.child({ route: 'cron/cleanup' });
    const result = await cleanupExpiredJobs({
      store: supabaseCleanupStore(createServiceSupabase()),
      storage: getStorage(),
      onError: (jobId, error) => log.error('cleanup failed for job', { jobId, error }),
    });
    log.info('cleanup finished', { ...result });
    return NextResponse.json(result);
  });
}
