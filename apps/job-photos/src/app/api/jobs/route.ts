import { getOptionalUser } from '@speedy/auth/user';
import { NextResponse } from 'next/server';

import { env } from '@/config/env';
import { createJobSchema } from '@/features/jobs/schemas';
import { createJob } from '@/features/jobs/server/repo';
import { handle, parseJsonBody } from '@/lib/http';
import { shareUrlFor } from '@/lib/share-url';

/**
 * POST /api/jobs: start a job. Works without sign-in: the job gets no owner, expires after
 * ANONYMOUS_JOB_TTL_DAYS and the device receives a claim token to prove it made the job later.
 * A signed-in user becomes the owner straight away.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handle('POST /api/jobs', async () => {
    const body = await parseJsonBody(request, createJobSchema);
    if (!body.ok) return body.response;
    const user = await getOptionalUser();
    const created = await createJob(body.data, user?.id ?? null);
    return NextResponse.json(
      { ...created, shareUrl: shareUrlFor(env.APP_URL, created.shareSlug) },
      { status: 201 },
    );
  });
}
