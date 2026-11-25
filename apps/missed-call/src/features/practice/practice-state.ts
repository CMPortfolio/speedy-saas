import type { Database } from '@speedy/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PracticeCall, PracticeMessageRow } from './practice-store';

/** What the practice phones show. */
export interface PracticeView {
  calls: PracticeCall[];
  messages: PracticeMessageRow[];
}

export const emptyPractice: PracticeView = { calls: [], messages: [] };

/** The owner's own practice rows, newest call first. `client` carries their session, so RLS limits it to them. */
export async function readPractice(client: SupabaseClient<Database>): Promise<PracticeView> {
  const db = client.schema('missed_call');
  const [calls, messages] = await Promise.all([
    db
      .from('practice_calls')
      .select('id, caller_number, received_at, status, texted_at, opted_out')
      .order('received_at', { ascending: false })
      .limit(50),
    db
      .from('practice_messages')
      .select('id, call_id, direction, body, created_at')
      .order('created_at', { ascending: true })
      .limit(400),
  ]);
  if (calls.error) throw new Error(`practice calls: ${calls.error.message}`);
  if (messages.error) throw new Error(`practice messages: ${messages.error.message}`);
  return {
    calls: (calls.data ?? []).map((r) => ({
      id: r.id,
      callerNumber: r.caller_number,
      receivedAt: r.received_at,
      status: r.status,
      textedAt: r.texted_at,
      optedOut: r.opted_out,
    })),
    messages: (messages.data ?? []).map((r) => ({
      id: r.id,
      callId: r.call_id,
      direction: r.direction as PracticeMessageRow['direction'],
      body: r.body,
      createdAt: r.created_at,
    })),
  };
}
