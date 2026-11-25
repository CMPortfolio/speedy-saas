import type { Db } from '@speedy/db/core';
import type { Tables } from '@speedy/db/types';

export type Reply = Tables<{ schema: 'rain_day' }, 'replies'>;

/** The owner's most recent replies. RLS limits rows to the owner. */
export async function listReplies(db: Db, limit = 20): Promise<Reply[]> {
  const { data, error } = await db
    .schema('rain_day')
    .from('replies')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
