import type { Database } from '@speedy/db/types';
import { appError } from '@speedy/lib/result';
import type { E164 } from '@speedy/lib/phone';
import type { OptOutStore } from '@speedy/sms/send';
import type { SupabaseClient } from '@supabase/supabase-js';

/** A line as the webhook handling needs it. */
export interface LineRecord {
  id: string;
  providerNumber: E164;
  ownerCell: string;
  businessName: string;
  template: string;
  afterHoursTemplate: string | null;
  /** Raw jsonb; parsed (and ignored when invalid) by parseQuietHours. */
  quietHours: unknown;
  timezone: string;
}

export type LogOutcome = 'send' | 'duplicate' | 'cooldown' | 'blocked';

export type ReplyOutcome = 'recorded' | 'duplicate' | 'blocked' | 'no_call';

export interface ReplyResult {
  callId: string | null;
  outcome: ReplyOutcome;
}

export interface LogResult {
  callId: string;
  outcome: LogOutcome;
  /** True when no text has ever gone to this caller on this line (adds the opt-out footer). */
  firstContact: boolean;
}

/**
 * Everything the missed-call webhook reads and writes. Implemented over the service-role Supabase
 * client (below) and in memory for unit tests. Only ever used from server routes, after the
 * provider signature has been checked.
 */
export interface MissedCallStore {
  findLineByNumber(number: E164): Promise<LineRecord | null>;
  /** Log the call and decide, atomically, whether to text. See missed_call.log_missed_call. */
  logMissedCall(lineId: string, caller: E164, callSid: string): Promise<LogResult>;
  recordTextSent(callId: string, body: string, providerMessageId: string): Promise<void>;
  /** The send failed: free the cooldown so the caller's next call can still be texted. */
  releaseTextClaim(callId: string): Promise<void>;
  /**
   * Attach an inbound text to the latest call from that number on that line and mark it replied.
   * See missed_call.record_reply. Retried webhooks come back as `duplicate`.
   */
  recordReply(
    lineId: string,
    caller: E164,
    body: string,
    providerMessageId: string,
  ): Promise<ReplyResult>;
  /** Blocked numbers (Junk) and STOP replies for one line. */
  optOuts(lineId: string): OptOutStore;
}

type Db = SupabaseClient<Database, 'missed_call'>;

function fail(what: string, cause: unknown): never {
  throw Object.assign(new Error(`missed_call store: ${what}`), {
    appError: appError('db_error', what, cause),
  });
}

/**
 * `client` must be the service-role client (`createServiceSupabase()` from @speedy/auth/server).
 * It is passed in, never imported here, so this file can be unit-tested and never pulls the key
 * into anything but the route that built the client.
 */
export function supabaseStore(client: SupabaseClient<Database>): MissedCallStore {
  const db: Db = client.schema('missed_call') as unknown as Db;

  return {
    async findLineByNumber(number) {
      const { data, error } = await db
        .from('lines')
        .select(
          'id, provider_number, owner_cell, business_name, template, after_hours_template, quiet_hours, timezone',
        )
        .eq('provider_number', number)
        .maybeSingle();
      if (error) fail('find line', error.message);
      if (!data) return null;
      return {
        id: data.id,
        providerNumber: number,
        ownerCell: data.owner_cell,
        businessName: data.business_name,
        template: data.template,
        afterHoursTemplate: data.after_hours_template,
        quietHours: data.quiet_hours,
        timezone: data.timezone,
      };
    },

    async logMissedCall(lineId, caller, callSid) {
      const { data, error } = await db.rpc('log_missed_call', {
        p_line_id: lineId,
        p_caller: caller,
        p_call_sid: callSid,
      });
      const row = data?.[0];
      if (error || !row) fail('log missed call', error?.message);
      return {
        callId: row.call_id,
        outcome: row.outcome as LogOutcome,
        firstContact: row.first_contact,
      };
    },

    async recordTextSent(callId, body, providerMessageId) {
      const msg = await db.from('messages').insert({
        call_id: callId,
        direction: 'out',
        body,
        provider_message_id: providerMessageId,
      });
      if (msg.error) fail('record message', msg.error.message);
      const upd = await db
        .from('calls')
        .update({ status: 'texted' })
        .eq('id', callId)
        .eq('status', 'missed');
      if (upd.error) fail('mark call texted', upd.error.message);
    },

    async recordReply(lineId, caller, body, providerMessageId) {
      const { data, error } = await db.rpc('record_reply', {
        p_line_id: lineId,
        p_caller: caller,
        p_body: body,
        p_provider_message_id: providerMessageId,
      });
      const row = data?.[0];
      if (error || !row) fail('record reply', error?.message);
      return { callId: row.call_id, outcome: row.outcome as ReplyOutcome };
    },

    async releaseTextClaim(callId) {
      const { error } = await db.from('calls').update({ texted_at: null }).eq('id', callId);
      if (error) fail('release text claim', error.message);
    },

    optOuts(lineId) {
      return {
        async isOptedOut(number) {
          const { data, error } = await db
            .from('blocked_numbers')
            .select('id')
            .eq('line_id', lineId)
            .eq('number', number)
            .maybeSingle();
          if (error) fail('check blocked number', error.message);
          return data !== null;
        },
        async setOptedOut(number, optedOut) {
          if (optedOut) {
            const { error } = await db
              .from('blocked_numbers')
              .upsert(
                { line_id: lineId, number, reason: 'opted_out' },
                { onConflict: 'line_id,number', ignoreDuplicates: true },
              );
            if (error) fail('save opt-out', error.message);
          } else {
            const { error } = await db
              .from('blocked_numbers')
              .delete()
              .eq('line_id', lineId)
              .eq('number', number)
              .eq('reason', 'opted_out');
            if (error) fail('clear opt-out', error.message);
          }
        },
      };
    },
  };
}
