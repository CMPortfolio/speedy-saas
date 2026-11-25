import type { Database } from '@speedy/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PracticeStatus = 'missed' | 'texted' | 'replied' | 'called_back' | 'booked' | 'junk';
export type PracticeDirection = 'out' | 'in' | 'forward';

export interface PracticeCall {
  id: string;
  callerNumber: string;
  receivedAt: string;
  status: PracticeStatus;
  textedAt: string | null;
  optedOut: boolean;
}

export interface PracticeMessageRow {
  id: string;
  callId: string;
  direction: PracticeDirection;
  body: string;
  createdAt: string;
}

export type Reservation = 'ok' | 'rate_limited' | 'full';

/**
 * Everything practice mode reads and writes, scoped to one owner. Implemented over the service-role
 * client for that owner (below) and in memory for tests. It only ever touches the practice tables:
 * the real calls, messages and blocked numbers are never read or written from here.
 */
export interface PracticeStore {
  /** Count one practice action against the owner's hourly and storage limits. */
  reserve(): Promise<Reservation>;
  /** This owner's practice calls from one caller, newest first. */
  callsFor(caller: string): Promise<PracticeCall[]>;
  getCall(id: string): Promise<PracticeCall | null>;
  addCall(caller: string, now: Date): Promise<string>;
  markTexted(callId: string, now: Date): Promise<void>;
  setStatus(callId: string, status: PracticeStatus): Promise<void>;
  /** Mark every practice call from this number as having texted STOP (or START). */
  setOptedOut(caller: string, optedOut: boolean): Promise<void>;
  addMessage(callId: string, direction: PracticeDirection, body: string): Promise<{ id: string }>;
  /** Delete all of this owner's practice data. */
  clear(): Promise<void>;
}

const CALL_COLUMNS = 'id, caller_number, received_at, status, texted_at, opted_out';

function toCall(row: {
  id: string;
  caller_number: string;
  received_at: string;
  status: PracticeStatus;
  texted_at: string | null;
  opted_out: boolean;
}): PracticeCall {
  return {
    id: row.id,
    callerNumber: row.caller_number,
    receivedAt: row.received_at,
    status: row.status,
    textedAt: row.texted_at,
    optedOut: row.opted_out,
  };
}

/** `client` must be the service-role client; every query is limited to `ownerId`. */
export function supabasePracticeStore(
  client: SupabaseClient<Database>,
  ownerId: string,
): PracticeStore {
  const db = client.schema('missed_call');
  const fail = (what: string, cause: { message: string } | null): never => {
    throw new Error(`practice: ${what}`, { cause });
  };

  return {
    async reserve() {
      const { data, error } = await db.rpc('reserve_practice_action', { p_owner_id: ownerId });
      if (error || !data) return fail('reserve action', error);
      return data as Reservation;
    },

    async callsFor(caller) {
      const { data, error } = await db
        .from('practice_calls')
        .select(CALL_COLUMNS)
        .eq('owner_id', ownerId)
        .eq('caller_number', caller)
        .order('received_at', { ascending: false });
      if (error) fail('list calls', error);
      return (data ?? []).map(toCall);
    },

    async getCall(id) {
      const { data, error } = await db
        .from('practice_calls')
        .select(CALL_COLUMNS)
        .eq('owner_id', ownerId)
        .eq('id', id)
        .maybeSingle();
      if (error) fail('get call', error);
      return data ? toCall(data) : null;
    },

    async addCall(caller, now) {
      const { data, error } = await db
        .from('practice_calls')
        .insert({ owner_id: ownerId, caller_number: caller, received_at: now.toISOString() })
        .select('id')
        .single();
      if (error || !data) return fail('add call', error);
      return data.id;
    },

    async markTexted(callId, now) {
      const { error } = await db
        .from('practice_calls')
        .update({ texted_at: now.toISOString(), status: 'texted' })
        .eq('owner_id', ownerId)
        .eq('id', callId);
      if (error) fail('mark texted', error);
    },

    async setStatus(callId, status) {
      const { error } = await db
        .from('practice_calls')
        .update({ status })
        .eq('owner_id', ownerId)
        .eq('id', callId);
      if (error) fail('set status', error);
    },

    async setOptedOut(caller, optedOut) {
      const { error } = await db
        .from('practice_calls')
        .update({ opted_out: optedOut })
        .eq('owner_id', ownerId)
        .eq('caller_number', caller);
      if (error) fail('set opt-out', error);
    },

    async addMessage(callId, direction, body) {
      const { data, error } = await db
        .from('practice_messages')
        .insert({ owner_id: ownerId, call_id: callId, direction, body })
        .select('id')
        .single();
      if (error || !data) return fail('add message', error);
      return { id: data.id };
    },

    async clear() {
      const { error } = await db.from('practice_calls').delete().eq('owner_id', ownerId);
      if (error) fail('clear', error);
    },
  };
}
