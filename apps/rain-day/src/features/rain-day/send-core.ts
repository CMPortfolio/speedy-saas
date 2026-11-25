import type { Db } from '@speedy/db/core';
import { logger } from '@speedy/lib/logger';
import type { E164 } from '@speedy/lib/phone';
import type { SmsProvider } from '@speedy/sms/provider';

import type { Customer } from '@/features/customers/queries';
import { describeNewDay } from '@/lib/dates';

import { hasOverlongBody, planMessages } from './plan';
import type { SendInput } from './schema';
import { sendQueuedMessages } from './send-queued';

export type SendResult =
  | { ok: true; rescheduleId: string; alreadySent: boolean }
  | { ok: false; message: string; rescheduleId?: string };

export const SEND_FAILED =
  'We could not send that just now. Nothing was sent. Try again in a minute.';

export const DAILY_LIMIT_MESSAGES = 1000;
export const DAILY_LIMIT_RAIN_DAYS = 3;

/** Messages the owner sees for the limits create_reschedule enforces. */
export function limitMessage(dbMessage: string | undefined): string | null {
  if (dbMessage === 'daily_limit_rain_days') {
    return `You have already sent ${DAILY_LIMIT_RAIN_DAYS} rain days today, which is the daily limit. You can send again tomorrow.`;
  }
  if (dbMessage === 'daily_limit_messages') {
    return `That would go over ${DAILY_LIMIT_MESSAGES.toLocaleString('en-US')} texts today, which is the daily limit. Untick some customers, or send the rest tomorrow.`;
  }
  return null;
}

export interface SendContext {
  /** The signed-in owner's client. */
  db: Db;
  service: Db;
  ownerId: string;
  /** That day's customers, read through RLS. */
  customers: readonly Customer[];
  optedOutPhones: ReadonlySet<string>;
  businessName: string;
  provider: SmsProvider;
  from: E164;
  /** Today in New York, for describing the new day. */
  today: string;
}

const log = logger.child({ feature: 'rain-day-send' });

/**
 * The send itself: plan one message per customer, make the rain day once per idempotency key,
 * and text each customer if this call is the one that made it. A repeat call (double tap, retry)
 * gets the existing rain day back and sends nothing.
 */
export async function runSend(ctx: SendContext, request: SendInput): Promise<SendResult> {
  const plan = planMessages({
    customers: ctx.customers,
    selectedIds: request.customerIds,
    optedOutPhones: ctx.optedOutPhones,
    template: request.template,
    newDay: describeNewDay(request.to, ctx.today),
  });
  if (plan.length === 0) return { ok: false, message: 'Tick at least one customer.' };
  if (hasOverlongBody(plan)) {
    return {
      ok: false,
      message: 'One of the texts is too long once names are filled in. Shorten your message.',
    };
  }

  const { data, error } = await ctx.db.schema('rain_day').rpc('create_reschedule', {
    p_idempotency_key: request.idempotencyKey,
    p_from_date: request.from,
    p_to_date: request.to,
    p_template: request.template,
    p_messages: plan,
  });
  const row = data?.[0];
  if (error || !row) {
    const limit = limitMessage(error?.message);
    if (limit) return { ok: false, message: limit };
    log.warn('create reschedule failed', { code: error?.code });
    return { ok: false, message: SEND_FAILED };
  }
  if (!row.created) return { ok: true, rescheduleId: row.reschedule_id, alreadySent: true };

  const sent = await sendQueuedMessages({
    db: ctx.db,
    service: ctx.service,
    ownerId: ctx.ownerId,
    rescheduleId: row.reschedule_id,
    customers: ctx.customers,
    provider: ctx.provider,
    from: ctx.from,
    businessName: ctx.businessName,
  });
  if (!sent.ok) {
    return {
      ok: false,
      rescheduleId: row.reschedule_id,
      message:
        'We saved your rain day but could not start the texts. Open it to see who was not texted.',
    };
  }
  return { ok: true, rescheduleId: row.reschedule_id, alreadySent: false };
}
