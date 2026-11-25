import type { Database } from '@speedy/db/types';
import type { E164 } from '@speedy/lib/phone';
import type { OptOutStore } from '@speedy/sms/send';
import type { SupabaseClient } from '@supabase/supabase-js';

import { anyBlockStore, stopListStore } from './blocked-store';
import { fail, type Db } from './store-db';

/** A line as the webhook handling needs it. */
export interface LineRecord {
  id: string;
  providerNumber: E164;
  /** The owner's own Twilio Messaging Service (MG...), admin-entered. Passed on every send. */
  messagingServiceSid: string | null;
  ownerCell: string;
  /** True once the owner confirmed the cell with a one-time code. Replies are not forwarded before. */
  ownerCellVerified: boolean;
  businessName: string;
  template: string;
  afterHoursTemplate: string | null;
  /** Raw jsonb; parsed (and ignored when invalid) by parseQuietHours. */
  quietHours: unknown;
  timezone: string;
}

/** The line's Messaging Service for a send, or nothing when it has none. The one place this is decided. */
export function withService(line: { messagingServiceSid: string | null }): {
  messagingServiceSid?: string;
} {
  return line.messagingServiceSid ? { messagingServiceSid: line.messagingServiceSid } : {};
}

/**
 * True when this line must not send yet: on the real provider in production, a line without its
 * own Messaging Service is "not ready", exactly like a line without a number. The fake provider and
 * development are unaffected.
 */
export function serviceMissing(
  line: { messagingServiceSid: string | null },
  provider: { name: string },
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return provider.name === 'twilio' && nodeEnv === 'production' && !line.messagingServiceSid;
}

export type LogOutcome = 'send' | 'duplicate' | 'cooldown' | 'blocked' | 'foreign' | 'rate_limited';

/**
 * `rate_limited`: saved, but too many from this caller or line lately, so not forwarded.
 * `dropped`: this caller already has 50 stored replies today; nothing is stored.
 */
export type ReplyOutcome =
  'recorded' | 'rate_limited' | 'dropped' | 'duplicate' | 'blocked' | 'no_call';

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
  /**
   * An id when HELP should be answered (the number has called this line and was not answered in
   * 24 hours), null otherwise. Give the id back to releaseHelpClaim if the send fails.
   */
  claimHelpReply(lineId: string, caller: E164, body: string): Promise<string | null>;
  releaseHelpClaim(claimId: string): Promise<void>;
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
          'id, provider_number, provider_messaging_service_sid, owner_cell, owner_cell_verified, business_name, template, after_hours_template, quiet_hours, timezone',
        )
        .eq('provider_number', number)
        .maybeSingle();
      if (error) fail('find line', error.message);
      if (!data) return null;
      return {
        id: data.id,
        providerNumber: number,
        messagingServiceSid: data.provider_messaging_service_sid,
        ownerCell: data.owner_cell,
        ownerCellVerified: data.owner_cell_verified,
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
      return data;
    },

    async releaseHelpClaim(claimId) {
      const { error } = await db.from('messages').delete().eq('id', claimId).eq('kind', 'help');
      if (error) fail('release help claim', error.message);
    },

    optOuts: (lineId) => anyBlockStore(db, lineId),
    stopList: (lineId) => stopListStore(db, lineId),
  };
}
