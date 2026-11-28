import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from './database.types';
import type { FeedbackInput, ProfileUpdate } from './schemas';

export type Db = SupabaseClient<Database>;

/** Typed helpers for the core tables. Pass any client; RLS decides what the caller may touch. */
export async function getProfile(db: Db, userId: string): Promise<Tables<'profiles'> | null> {
  const { data, error } = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Drop undefined keys so optional form fields don't overwrite columns with null. */
function compact<T extends object>(obj: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

export async function updateProfile(
  db: Db,
  userId: string,
  patch: ProfileUpdate,
): Promise<Tables<'profiles'>> {
  const { data, error } = await db
    .from('profiles')
    .upsert({ id: userId, ...compact(patch) }, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Insert or bump the tool_usage row for the signed-in user. No-op for anonymous callers. */
export async function recordToolUsage(db: Db, toolSlug: string): Promise<void> {
  const { error } = await db.rpc('record_tool_usage', { slug: toolSlug });
  if (error) throw error;
}

export async function leaveFeedback(
  db: Db,
  input: FeedbackInput,
  userId: string | null,
): Promise<void> {
  const { error } = await db.from('feedback').insert({
    tool_slug: input.tool_slug,
    helped: input.helped,
    note: input.note ?? null,
    user_id: userId,
  });
  if (error) throw error;
}
