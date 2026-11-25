import { createServerSupabase } from '@speedy/auth/server';
import { getOptionalUser } from '@speedy/auth/user';
import { getProfile, recordToolUsage } from '@speedy/db/core';
import { NextResponse } from 'next/server';

import { env } from '@/config/env';
import { createJobSchema, type CreateJobInput } from '@/features/jobs/schemas';
import { createJob } from '@/features/jobs/server/repo';
import { handle, parseJsonBody } from '@/lib/http';
import { shareUrlFor } from '@/lib/share-url';

import { tool } from '../../../../tool.config';

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
    let input: CreateJobInput & { logo_path?: string | null } = body.data;
    if (user) {
      // Signed-in owners: the profile fills in what the form left blank, and the use counts.
      const db = await createServerSupabase();
      const profile = await getProfile(db, user.id);
      input = {
        ...input,
        business_name: input.business_name ?? profile?.business_name ?? null,
        logo_path: profile?.logo_path ?? null,
      };
      await recordToolUsage(db, tool.slug);
    }
    const created = await createJob(input, user?.id ?? null);
    return NextResponse.json(
      { ...created, shareUrl: shareUrlFor(env.APP_URL, created.shareSlug) },
      { status: 201 },
    );
  });
}
