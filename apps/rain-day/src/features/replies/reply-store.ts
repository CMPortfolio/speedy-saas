import type { Db } from '@speedy/db/core';
import type { Database } from '@speedy/db/types';
import type { E164 } from '@speedy/lib/phone';

import type { RecordedReply, ReplyStore } from './handle-inbound';

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

/**
 * Reply store on the service-role client (a webhook has no signed-in user). Opt-out is per phone
 * number, across every owner: STOP stops texts from this business number, whoever sent them.
 */
export function createReplyStore(db: Db): ReplyStore {
  const customers = () => db.schema('rain_day').from('customers');
  const optOuts = () => db.schema('rain_day').from('opt_outs');
  return {
    optOuts: {
      // Any owner's STOP on file counts: STOP is to the business number, not to one owner.
      async isOptedOut(number) {
        const { data, error } = await optOuts().select('id').eq('phone', number).limit(1);
        if (error) throw error;
        return data.length > 0;
      },
      async setOptedOut(number, optedOut) {
        if (!optedOut) {
          const { error } = await optOuts().delete().eq('phone', number);
          if (error) throw error;
          return;
        }
        // One row per owner who has this number as a customer.
        const { data, error } = await customers().select('owner_id').eq('phone', number);
        if (error) throw error;
        const owners = [...new Set(data.map((c) => c.owner_id))];
        if (owners.length === 0) return;
        const { error: insertError } = await optOuts().upsert(
          owners.map((owner_id) => ({ owner_id, phone: number })),
          { onConflict: 'owner_id,phone', ignoreDuplicates: true },
        );
        if (insertError) throw insertError;
      },
    },

    async recordReply(input): Promise<RecordedReply> {
      const { data, error } = await db.schema('rain_day').rpc('record_reply', {
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
        .eq('id', replyId);
      if (error) throw error;
    },

    async helpBusinessName(phone: E164) {
      const { data: people, error } = await customers().select('id, owner_id').eq('phone', phone);
      if (error) throw error;
      if (people.length === 0) return null;
      // The owner who texted this number most recently, else any owner who has them.
      const { data: latest } = await db
        .schema('rain_day')
        .from('reschedule_messages')
        .select('customer_id')
        .in(
          'customer_id',
          people.map((p) => p.id),
        )
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(1);
      const owner =
        people.find((p) => p.id === latest?.[0]?.customer_id)?.owner_id ?? people[0]?.owner_id;
      if (!owner) return null;
      const { data: profile } = await db
        .from('profiles')
        .select('business_name')
        .eq('id', owner)
        .maybeSingle();
      return profile?.business_name?.trim() || 'Rain Day';
    },

    async claimHelp(phone: E164) {
      const { data, error } = await db
        .schema('rain_day')
        .rpc('claim_help_reply', { p_phone: phone });
      if (error) throw error;
      return data;
    },
  };
}
