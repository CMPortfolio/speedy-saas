'use server';

import { createServerSupabase, createServiceSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { getProfile } from '@speedy/db/core';
import type { Json } from '@speedy/db/types';
import { logger } from '@speedy/lib/logger';
import { revalidatePath } from 'next/cache';

import { getSms, getSmsFrom } from '@/config/sms';
import { describeNewDay, todayInNewYork, weekdayOf } from '@/lib/dates';

import { planMessages, type PlannedMessage } from './plan';
import { listCustomersForDay } from './queries';
import { sendInputSchema, type SendInput } from './schema';
import { sendQueuedMessages, type SendQueuedInput } from './send-queued';

export type SendResult =
  { ok: true; rescheduleId: string; alreadySent: boolean } | { ok: false; message: string };

const FAILED = 'We could not send that just now. Nothing was sent. Try again in a minute.';

type Ready = Omit<SendQueuedInput, 'rescheduleId'> & { plan: PlannedMessage[] };
type Prepared = { ready: Ready } | { problem: string };

function texting() {
  try {
    return { service: createServiceSupabase(), provider: getSms(), from: getSmsFrom() };
  } catch (error) {
    logger.error('rain-day: texting is not configured', { error });
    return null;
  }
}

/** Everything that can stop a send before anything is written: business name, setup, who is on. */
async function prepare(userId: string, request: SendInput): Promise<Prepared> {
  const today = todayInNewYork();
  if (request.to < today) return { problem: 'Pick a new day that is today or later.' };
  const db = await createServerSupabase();
  const businessName = (await getProfile(db, userId))?.business_name?.trim();
  if (!businessName) {
    return { problem: 'Add your business name in Settings first. Customers see it in the text.' };
  }
  const setup = texting();
  if (!setup) return { problem: FAILED };
  const customers = await listCustomersForDay(db, weekdayOf(request.from));
  const plan = planMessages({
    customers,
    selectedIds: request.customerIds,
    template: request.template,
    newDay: describeNewDay(request.to, today),
  });
  if (plan.length === 0) return { problem: 'Tick at least one customer.' };
  return { ready: { db, ownerId: userId, customers, businessName, plan, ...setup } };
}

/**
 * Send one rain day. The browser's idempotency key makes a double tap or a retry safe:
 * `create_reschedule` makes the rain day and its message rows once, and only the call that
 * created them sends. A repeat gets the existing rain day back and sends nothing.
 *
 * The server rebuilds every message itself from the owner's own customers (RLS), so a changed
 * request cannot text a stranger or put one customer's details in another's message.
 */
export async function sendRainDay(input: unknown): Promise<SendResult> {
  const user = await requireUser('/rain-day');
  const parsed = sendInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Check the form and try again.',
    };
  }
  const request = parsed.data;
  const prepared = await prepare(user.id, request);
  if ('problem' in prepared) return { ok: false, message: prepared.problem };
  const { plan, ...ready } = prepared.ready;

  const { data, error } = await ready.db.schema('rain_day').rpc('create_reschedule', {
    p_idempotency_key: request.idempotencyKey,
    p_from_date: request.from,
    p_to_date: request.to,
    p_template: request.template,
    p_messages: plan as unknown as Json,
  });
  const row = data?.[0];
  if (error || !row) {
    logger.warn('rain-day: create reschedule failed', { code: error?.code });
    return { ok: false, message: FAILED };
  }
  if (!row.created) return { ok: true, rescheduleId: row.reschedule_id, alreadySent: true };

  // Only the call that created the rain day gets here.
  await sendQueuedMessages({ ...ready, rescheduleId: row.reschedule_id });
  revalidatePath('/rain-day');
  return { ok: true, rescheduleId: row.reschedule_id, alreadySent: false };
}
