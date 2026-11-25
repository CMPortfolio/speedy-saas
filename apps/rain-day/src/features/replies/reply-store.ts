import type { Db } from '@speedy/db/core';
import type { Database } from '@speedy/db/types';
import { logger } from '@speedy/lib/logger';
import type { E164 } from '@speedy/lib/phone';

import { codeOf } from '@/lib/error-code';

import type { InboundStore, RecordedReply, ReplyStore } from './handle-inbound';

type RecordReplyRow = Database['rain_day']['Functions']['record_reply']['Returns'][number];

const NO_MATCH: RecordedReply = {
  matched: false,
  duplicate: false,
  replyId: null,
  customerName: null,
  customerPhone: null,
  ownerCell: null,
  forward: false,
};

function toRecorded(row: RecordReplyRow | undefined): RecordedReply {
  if (!row) return NO_MATCH;
  return {
    matched: row.matched,
    duplicate: row.duplicate,
    replyId: row.reply_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    ownerCell: row.owner_cell,
    forward: row.forward,
  };
}

const log = logger.child({ feature: 'rain-day-reply-store' });

/**
 * Inbound store on the service-role client (a webhook has no signed-in user). The owner comes
 * from the number that was texted; every query after that names that owner, because the service
 * role bypasses RLS.
 */
export function createInboundStore(db: Db): InboundStore {
  return {
    async ownerForNumber(to: E164) {
      const { data, error } = await db
        .schema('rain_day')
        .from('owner_settings')
        .select('owner_id, sender_messaging_service_sid')
        .eq('sender_number', to)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { ownerId: data.owner_id, messagingServiceSid: data.sender_messaging_service_sid }
        : null;
    },
    forOwner: (ownerId) => createReplyStore(db, ownerId),
  };
}

export function createReplyStore(db: Db, ownerId: string): ReplyStore {
  const optOuts = () => db.schema('rain_day').from('opt_outs');
  return {
    optOuts: {
      async isOptedOut(number) {
        const { data, error } = await optOuts()
          .select('id')
          .eq('owner_id', ownerId)
          .eq('phone', number)
          .limit(1);
        if (error) throw error;
        return data.length > 0;
      },
      async setOptedOut(number, optedOut) {
        if (optedOut) {
          // Recorded by number for this owner, with or without a customer row.
          const { error } = await optOuts().upsert(
            { owner_id: ownerId, phone: number },
            { onConflict: 'owner_id,phone', ignoreDuplicates: true },
          );
          if (error) throw error;
          return;
        }
        const { error } = await optOuts().delete().eq('owner_id', ownerId).eq('phone', number);
        if (error) throw error;
      },
    },

    async recordReply(input): Promise<RecordedReply> {
      const { data, error } = await db.schema('rain_day').rpc('record_reply', {
        p_owner_id: ownerId,
        p_from: input.from,
        p_provider_message_id: input.providerMessageId,
        p_body: input.body.slice(0, 1600),
        p_forward_cap: input.forwardCap,
      });
      if (error) throw error;
      return toRecorded(data[0]);
    },

    async markForward(replyId, status) {
      const { error } = await db
        .schema('rain_day')
        .from('replies')
        .update({ forward_status: status })
        .eq('id', replyId)
        .eq('owner_id', ownerId);
      if (error) throw error;
    },

    async helpBusinessName(phone: E164) {
      const { data: known, error } = await db
        .schema('rain_day')
        .from('customers')
        .select('id')
        .eq('owner_id', ownerId)
        .eq('phone', phone)
        .limit(1);
      if (error) throw error;
      if (known.length === 0) return null;
      const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('business_name')
        .eq('id', ownerId)
        .maybeSingle();
      if (profileError) {
        log.warn('business name lookup failed', { code: codeOf(profileError) });
        return 'Rain Day';
      }
      const name = profile?.business_name?.trim();
      return name ? name : 'Rain Day';
    },

    async claimHelp(phone: E164) {
      const { data, error } = await db
        .schema('rain_day')
        .rpc('claim_help_reply', { p_owner_id: ownerId, p_phone: phone });
      if (error) throw error;
      return data;
    },
  };
}
