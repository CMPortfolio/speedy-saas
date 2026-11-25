import type { Database } from '@speedy/db/types';
import type { E164 } from '@speedy/lib/phone';
import type { OptOutStore } from '@speedy/sms/send';
import type { SupabaseClient } from '@supabase/supabase-js';

import { anyBlockStore, fail, stopListStore, type Db } from './blocked-store';

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

export type LogOutcome = 'send' | 'duplicate' | 'cooldown' | 'blocked' | 'foreign' | 'rate_limited';

/** `rate_limited`: saved, but too many from this caller or line lately, so not forwarded. */
export type ReplyOutcome = 'recorded' | 'rate_limited' | 'duplicate' | 'blocked' | 'no_call';

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
  logMissedCall(
    lineId: string,
    caller: E164,
    callSid: string,
    allowText: boolean,
  ): Promise<LogResult>;
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
  /** True when HELP should be answered: the number has called this line and was not answered in 24 hours. */
  claimHelpReply(lineId: string, caller: E164, body: string): Promise<boolean>;
  /** The send guard: any block on the line, whether Junk or STOP. */
  optOuts(lineId: string): OptOutStore;
  /** Only who texted STOP (and not START since). Give this one to applyOptOutKeyword. */
  stopList(lineId: string): OptOutStore;
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

    async logMissedCall(lineId, caller, callSid, allowText) {
      const { data, error } = await db.rpc('log_missed_call', {
        p_line_id: lineId,
        p_caller: caller,
        p_call_sid: callSid,
        p_allow_text: allowText,
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

    async claimHelpReply(lineId, caller, body) {
      const { data, error } = await db.rpc('claim_help_reply', {
        p_line_id: lineId,
        p_caller: caller,
        p_body: body,
      });
      if (error) fail('claim help reply', error.message);
      return data === true;
    },

    optOuts: (lineId) => anyBlockStore(db, lineId),
    stopList: (lineId) => stopListStore(db, lineId),
  };
}
