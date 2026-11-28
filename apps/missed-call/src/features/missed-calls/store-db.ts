import type { Database } from '@speedy/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The service-role client, scoped to the missed_call schema. */
export type Db = SupabaseClient<Database, 'missed_call'>;

/** A database call failed. The message names what we were doing, never the data. */
export function fail(what: string, cause: unknown): never {
  throw new Error(`missed_call store: ${what}`, { cause });
}
