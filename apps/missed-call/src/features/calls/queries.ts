import type { Database } from '@speedy/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import { toCallRows, type CallQueryRow, type CallRow } from './call-rows';

/** The signed-in owner's missed calls, newest first. `client` carries their session, so RLS decides what they see. */
export async function listCalls(client: SupabaseClient<Database>, limit = 100): Promise<CallRow[]> {
  const { data, error } = await client
    .schema('missed_call')
    .from('calls')
    .select(
      'id, caller_number, received_at, status, lines(timezone), messages(direction, body, created_at)',
    )
    .order('received_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`list calls: ${error.message}`);
  return toCallRows(data as unknown as CallQueryRow[]);
}

export type OwnerStatus = 'called_back' | 'booked' | 'junk';

/** Called back, Booked or Junk. Junk also blocks the number on that line (see missed_call.mark_call). */
export async function markCall(
  client: SupabaseClient<Database>,
  callId: string,
  status: OwnerStatus,
): Promise<void> {
  const { error } = await client
    .schema('missed_call')
    .rpc('mark_call', { p_call_id: callId, p_status: status });
  if (error) throw new Error(`mark call: ${error.message}`);
}
