import type { Db } from '@speedy/db/core';
import { logger } from '@speedy/lib/logger';
import type { E164 } from '@speedy/lib/phone';
import type { SmsProvider } from '@speedy/sms/provider';

import type { Customer } from '@/features/customers/queries';

import { createDispatchStore } from './delivery-store';
import { dispatchMessages, type DispatchOutcome, type DispatchRow } from './dispatch';

export interface SendQueuedInput {
  /** The signed-in owner's client: RLS applies to every read here. */
  db: Db;
  /** Service-role client, used only to record results on the rows just created. */
  service: Db;
  rescheduleId: string;
  customers: readonly Customer[];
  provider: SmsProvider;
  from: E164;
  businessName: string;
}

export type SendQueuedResult = { ok: true; outcome: DispatchOutcome } | { ok: false };

const log = logger.child({ feature: 'rain-day-send' });

/**
 * Text every queued message of a rain day this call just created. Never retries a send. If the
 * lookups before sending fail, nothing is sent and the rows stay queued (the results page shows
 * them as not sent after a couple of minutes).
 */
export async function sendQueuedMessages(input: SendQueuedInput): Promise<SendQueuedResult> {
  const { db, rescheduleId } = input;
  const { data: queued, error } = await db
    .schema('rain_day')
    .from('reschedule_messages')
    .select('id, customer_id, body')
    .eq('reschedule_id', rescheduleId)
    .eq('status', 'queued');
  if (error) {
    log.error('read back messages failed', { code: error.code });
    return { ok: false };
  }
  // The opt-out line goes on the first text a customer ever gets from this owner.
  const { data: before, error: beforeError } = await db
    .schema('rain_day')
    .rpc('previously_texted', { p_reschedule_id: rescheduleId });
  if (beforeError) {
    log.error('first-contact lookup failed', { code: beforeError.code });
    return { ok: false };
  }
  const contacted = new Set(before);
  const byId = new Map(input.customers.map((c) => [c.id, c]));

  const rows: DispatchRow[] = queued.flatMap((m) => {
    const customer = m.customer_id ? byId.get(m.customer_id) : undefined;
    if (!customer) return [];
    return [
      {
        id: m.id,
        customerId: customer.id,
        phone: customer.phone as E164,
        body: m.body,
        isFirstContact: !contacted.has(customer.id),
      },
    ];
  });

  const outcome = await dispatchMessages({
    provider: input.provider,
    store: createDispatchStore(input.service, input.provider.name),
    rows,
    from: input.from,
    businessName: input.businessName,
  });
  log.info('sent', { total: rows.length, ...outcome });
  return { ok: true, outcome };
}
