import type { Db } from '@speedy/db/core';
import { logger } from '@speedy/lib/logger';
import type { E164 } from '@speedy/lib/phone';
import type { SmsProvider } from '@speedy/sms/provider';

import type { Customer } from '@/features/customers/queries';

import { createDispatchStore } from './delivery-store';
import { dispatchMessages, type DispatchRow } from './dispatch';

export interface SendQueuedInput {
  /** The signed-in owner's client: RLS applies to every read here. */
  db: Db;
  /** Service-role client, used only to record results on the rows just created. */
  service: Db;
  ownerId: string;
  rescheduleId: string;
  customers: readonly Customer[];
  provider: SmsProvider;
  from: E164;
  businessName: string;
}

/** Text every queued message of a rain day this call just created. Never retries a send. */
export async function sendQueuedMessages(input: SendQueuedInput): Promise<void> {
  const { db, rescheduleId } = input;
  const { data: queued, error } = await db
    .schema('rain_day')
    .from('reschedule_messages')
    .select('id, customer_id, body')
    .eq('reschedule_id', rescheduleId)
    .eq('status', 'queued');
  if (error) {
    logger.error('rain-day: read back messages failed', { code: error.code });
    return;
  }
  const ids = queued.map((m) => m.customer_id).filter((id): id is string => !!id);
  // The opt-out line goes on the first text a customer ever gets from this owner.
  const { data: before } = await db
    .schema('rain_day')
    .from('reschedule_messages')
    .select('customer_id')
    .in('customer_id', ids)
    .in('status', ['sent', 'delivered', 'replied'])
    .neq('reschedule_id', rescheduleId);
  const contacted = new Set((before ?? []).map((m) => m.customer_id));
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
    store: createDispatchStore(input.service, input.ownerId),
    rows,
    from: input.from,
    businessName: input.businessName,
  });
  logger.info('rain-day: sent', { total: rows.length, ...outcome });
}
