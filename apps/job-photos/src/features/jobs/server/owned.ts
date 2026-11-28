import 'server-only';

import type { ServerSupabase } from '@speedy/auth/server';

export interface OwnedJob {
  id: string;
  title: string | null;
  business_name: string | null;
  share_slug: string;
  created_at: string;
}

/**
 * The signed-in owner's jobs, newest first. Uses the caller's own client, so RLS does the
 * filtering: a user can only ever get their own rows back from this query.
 */
export async function listOwnedJobs(db: ServerSupabase, userId: string): Promise<OwnedJob[]> {
  const { data, error } = await db
    .schema('job_photos')
    .from('jobs')
    .select('id, title, business_name, share_slug, created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}
