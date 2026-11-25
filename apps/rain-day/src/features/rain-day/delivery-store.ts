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
 * user on a webhook. Idempotent: a repeated or out-of-order event changes nothing.
 */
export async function applyDeliveryEvent(db: Db, event: DeliveryEvent): Promise<void> {
  const next = mapDeliveryStatus(event.status);
  if (!next) return;
  const { data, error } = await db
    .schema('rain_day')
    .from('reschedule_messages')
    .update({ status: next, ...(next === 'failed' ? { error_code: event.errorCode ?? null } : {}) })
    .eq('provider_message_id', event.providerMessageId)
    .in('status', allowedPreviousStatuses(next))
    .select('id');
  if (error) throw error;
  if (data.length === 0) {
    // Unknown id, or already at this status or further along. Both are fine.
    log.debug('delivery event changed nothing', { status: event.status });
  }
}

/**
 * Dispatch store backed by the service-role client, scoped to one owner. The service role
 * bypasses RLS, so every query names the owner (customers) or the exact message id.
 */
export function createDispatchStore(db: Db, ownerId: string): DispatchStore {
  return {
    async isOptedOut(phone: E164) {
      const { data, error } = await db
        .schema('rain_day')
        .from('customers')
        .select('opted_out')
        .eq('owner_id', ownerId)
        .eq('phone', phone)
        .maybeSingle();
      if (error) throw error;
      return data?.opted_out ?? false;
    },

    async markResult(messageId: string, result: DispatchResult) {
      const patch =
        result.status === 'sent'
          ? {
              status: 'sent',
              provider_message_id: result.providerMessageId,
              sent_at: new Date().toISOString(),
            }
          : result.status === 'failed'
            ? { status: 'failed', error_code: result.errorCode }
            : { status: 'skipped' };
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
