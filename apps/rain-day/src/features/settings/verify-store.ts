import type { Db } from '@speedy/db/core';
import type { VerifyStore } from '@speedy/sms/verify-phone';

/**
 * Phone-verification state in the rain_day schema, on the service-role client. The limits that
 * must not race (code texts per hour, wrong tries) run inside SQL functions.
 */
export function createVerifyStore(db: Db): VerifyStore {
  const table = () => db.schema('rain_day').from('phone_verifications');
  return {
    async reserveSend(subject, limit, windowMs) {
      const { data, error } = await db.schema('rain_day').rpc('reserve_verification_send', {
        p_owner_id: subject,
        p_limit: limit,
        p_window_seconds: Math.round(windowMs / 1000),
      });
      if (error) throw error;
      return data;
    },

    async saveChallenge(subject, challenge) {
      const { error } = await table().upsert(
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
      if (error) throw error;
    },

    async getChallenge(subject) {
      const { data, error } = await table().select('*').eq('owner_id', subject).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        phone: data.phone as `+1${string}`,
        codeHash: data.code_hash,
        salt: data.salt,
        expiresAt: new Date(data.expires_at),
        attempts: data.attempts,
      };
    },

    async consumeAttempt(subject) {
      const { data, error } = await db
        .schema('rain_day')
        .rpc('consume_verification_attempt', { p_owner_id: subject });
      if (error) throw error;
      return data;
    },

    async clearChallenge(subject) {
      const { error } = await table().delete().eq('owner_id', subject);
      if (error) throw error;
    },
  };
}

/** True when a code was texted to this owner and has not expired yet. */
export async function hasPendingCode(store: VerifyStore, ownerId: string): Promise<boolean> {
  const challenge = await store.getChallenge(ownerId);
  return challenge !== null && challenge.expiresAt.getTime() > Date.now();
}
