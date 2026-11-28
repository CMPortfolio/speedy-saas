import type { Database } from '@speedy/db/types';
import type { E164 } from '@speedy/lib/phone';
import type { VerifyStore } from '@speedy/sms/verify-phone';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { CellLine, CellVerifierDeps } from './cell-verifier';

/**
 * The confirmation state in the missed_call schema, on the service-role client. The limits that
 * must not race (code texts an hour, wrong tries) run inside SQL functions. Owners have no access to
 * these tables: only the server reads or writes them.
 */
export function createVerifyStore(client: SupabaseClient<Database>): VerifyStore {
  const db = client.schema('missed_call');
  const challenges = () => db.from('cell_verifications');
  return {
    async reserveSend(subject, limit, windowMs) {
      const { data, error } = await db.rpc('reserve_cell_code_send', {
        p_owner_id: subject,
        p_limit: limit,
        p_window_seconds: Math.round(windowMs / 1000),
      });
      if (error) throw new Error(`reserve cell code send: ${error.message}`);
      return data;
    },

    async saveChallenge(subject, challenge) {
      const { error } = await challenges().upsert(
        {
          owner_id: subject,
          phone: challenge.phone,
          code_hash: challenge.codeHash,
          salt: challenge.salt,
          expires_at: challenge.expiresAt.toISOString(),
          attempts: 0,
        },
        { onConflict: 'owner_id' },
      );
      if (error) throw new Error(`save cell challenge: ${error.message}`);
    },

    async getChallenge(subject) {
      const { data, error } = await challenges().select('*').eq('owner_id', subject).maybeSingle();
      if (error) throw new Error(`get cell challenge: ${error.message}`);
      if (!data) return null;
      return {
        phone: data.phone as E164,
        codeHash: data.code_hash,
        salt: data.salt,
        expiresAt: new Date(data.expires_at),
        attempts: data.attempts,
      };
    },

    async consumeAttempt(subject) {
      const { data, error } = await db.rpc('consume_cell_attempt', { p_owner_id: subject });
      if (error) throw new Error(`consume cell attempt: ${error.message}`);
      return data;
    },

    async clearChallenge(subject) {
      const { error } = await challenges().delete().eq('owner_id', subject);
      if (error) throw new Error(`clear cell challenge: ${error.message}`);
    },
  };
}

/** Reads the owner's line and marks it verified, both with the service role. */
export function createLineAccess(
  client: SupabaseClient<Database>,
): Pick<CellVerifierDeps, 'loadLine' | 'markVerified'> {
  const db = client.schema('missed_call');
  return {
    async loadLine(ownerId): Promise<CellLine | null> {
      const { data, error } = await db
        .from('lines')
        .select(
          'owner_cell, owner_cell_verified, provider_number, provider_messaging_service_sid, business_name',
        )
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (error) throw new Error(`load line: ${error.message}`);
      if (!data) return null;
      return {
        ownerCell: data.owner_cell,
        ownerCellVerified: data.owner_cell_verified,
        providerNumber: data.provider_number,
        messagingServiceSid: data.provider_messaging_service_sid,
        businessName: data.business_name,
      };
    },

    async markVerified(ownerId, phone) {
      const { data, error } = await db.rpc('confirm_owner_cell', {
        p_owner_id: ownerId,
        p_phone: phone,
      });
      if (error) throw new Error(`confirm owner cell: ${error.message}`);
      return data;
    },
  };
}
