import 'server-only';

import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

import { createServerSupabase } from './server';

/** The signed-in user, or null. Use by default so tools work before sign-in. */
export async function getOptionalUser(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** The signed-in user, or a redirect to sign-in that comes back to `next` afterwards. */
export async function requireUser(next = '/'): Promise<User> {
  const user = await getOptionalUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}
