import type { Db } from '@speedy/db/core';
import { logger } from '@speedy/lib/logger';
import type { E164 } from '@speedy/lib/phone';
import type { DeliveryEvent } from '@speedy/sms/provider';

import { allowedPreviousStatuses, mapDeliveryStatus } from './delivery';
import type { DispatchResult, DispatchStore } from './dispatch';

const log = logger.child({ feature: 'rain-day-delivery' });

/**
 * Apply a provider delivery event to its message. Call only after the webhook signature was
 * verified (`handleWebhook` does that). Needs the service-role client: there is no signed-in
 * user on a webhook. Idempotent: a repeated or out-of-order event changes nothing. The id is
 * matched together with the provider's name, since ids are only unique within one provider.
 */
export async function applyDeliveryEvent(
  db: Db,
  event: DeliveryEvent,
  providerName: string,
): Promise<void> {
  const next = mapDeliveryStatus(event.status);
  if (!next) return;
  const { data, error } = await db
    .schema('rain_day')
    .from('reschedule_messages')
    .update({ status: next, ...(next === 'failed' ? { error_code: event.errorCode ?? null } : {}) })
    .eq('provider', providerName)
    .eq('provider_message_id', event.providerMessageId)
    .in('status', allowedPreviousStatuses(next))
    .select('id');
  if (error) throw error;
  if (data.length === 0) {
    // Unknown id, already at this status or further along, or the event beat the send step's
    // write of the provider id. All fine; a later event carries the same news.
    log.info('delivery event changed nothing', { status: event.status });
  }
}

/**
 * Dispatch store backed by the service-role client, scoped to one owner. The service role
 * bypasses RLS, so every query names the owner or the exact message id. A number counts as opted
 * out only if THIS owner has a STOP on file for it: STOP is to one sender number, so it does not
 * reach another owner's texts to the same person.
 */
export function createDispatchStore(db: Db, providerName: string, ownerId: string): DispatchStore {
  return {
    async isOptedOut(phone: E164) {
      const { data, error } = await db
        .schema('rain_day')
        .from('opt_outs')
        .select('id')
        .eq('owner_id', ownerId)
        .eq('phone', phone)
        .limit(1);
      if (error) throw error;
      return data.length > 0;
    },

    async markResult(messageId: string, result: DispatchResult) {
      const patch =
        result.status === 'sent'
          ? {
              status: 'sent',
              provider: providerName,
              provider_message_id: result.providerMessageId,
              sent_at: new Date().toISOString(),
            }
          : result.status === 'failed'
            ? { status: 'failed', error_code: result.errorCode }
            : { status: 'skipped', error_code: result.errorCode };
      const { error } = await db
        .schema('rain_day')
        .from('reschedule_messages')
        .update(patch)
        .eq('id', messageId)
        .eq('status', 'queued');
      if (error) throw error;
    },
  };
}
