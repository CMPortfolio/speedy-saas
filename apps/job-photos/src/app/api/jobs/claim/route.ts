import { createServerSupabase } from '@speedy/auth/server';
import { getOptionalUser } from '@speedy/auth/user';
import { recordToolUsage } from '@speedy/db/core';
import { NextResponse } from 'next/server';

import { claimRequestSchema } from '@/features/jobs/claims';
import { claimJobs, moveBusinessToProfile } from '@/features/jobs/server/claim';
import { handle, jsonError, parseJsonBody } from '@/lib/http';

import { tool } from '../../../../../tool.config';

/**
 * POST /api/jobs/claim: after sign-in, the phone sends the claim tokens it kept and the jobs it
 * made become the user's (owner set, expiry and token hash cleared). Only tokens that hash to
 * what we stored claim anything. Business details on the device move to the profile.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handle('POST /api/jobs/claim', async () => {
    const user = await getOptionalUser();
    if (!user) return jsonError(401, 'sign_in', 'Sign in to save your jobs.');
    const body = await parseJsonBody(request, claimRequestSchema);
    if (!body.ok) return body.response;

    const db = await createServerSupabase();
    const claimed = await claimJobs(user.id, body.data.claims);
    await moveBusinessToProfile(db, user.id, body.data.business);
    if (claimed.length > 0) await recordToolUsage(db, tool.slug);
    return NextResponse.json({ claimed });
  });
}
