'use server';

import { createServerSupabase, createServiceSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { getProfile } from '@speedy/db/core';
import { logger } from '@speedy/lib/logger';
import { revalidatePath } from 'next/cache';

import { getSms } from '@/config/sms';
import { getOwnerSettings, NO_SENDER_MESSAGE } from '@/features/settings/owner-cell';
import { resolveSender } from '@/features/settings/sender';
import { todayInNewYork, weekdayOf } from '@/lib/dates';
import { codeOf } from '@/lib/error-code';

import { listCustomersForDay, listOptedOutPhones } from './queries';
import { sendInputSchema, type SendInput } from './schema';
import { runSend, SEND_FAILED, type SendContext, type SendResult } from './send-core';

export type { SendResult } from './send-core';

type Prepared = { ctx: SendContext } | { problem: string };

/** Everything that can stop a send before anything is written: business name, setup, who is on. */
async function prepare(userId: string, request: SendInput): Promise<Prepared> {
  const today = todayInNewYork();
  if (request.to < today) return { problem: 'Pick a new day that is today or later.' };
  const db = await createServerSupabase();
  const businessName = (await getProfile(db, userId))?.business_name?.trim();
  if (!businessName) {
    return { problem: 'Add your business name in Settings first. Customers see it in the text.' };
  }
  const provider = getSms();
  const sender = resolveSender(await getOwnerSettings(db), provider.name);
  if (!sender) return { problem: NO_SENDER_MESSAGE };
  const [customers, optedOutPhones] = await Promise.all([
    listCustomersForDay(db, weekdayOf(request.from)),
    listOptedOutPhones(db),
  ]);
  return {
    ctx: {
      db,
      service: createServiceSupabase(),
      ownerId: userId,
      customers,
      optedOutPhones,
      businessName,
      provider,
      sender,
      today,
    },
  };
}

/**
 * Send one rain day. The browser's idempotency key makes a double tap or a retry safe:
 * `create_reschedule` makes the rain day and its message rows once, and only the call that
 * created them sends. A repeat gets the existing rain day back and sends nothing.
 *
 * The server rebuilds every message itself from the owner's own customers (RLS), so a changed
 * request cannot text a stranger or put one customer's details in another's message. Any
 * unexpected failure comes back as a message, never as a thrown error.
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
  try {
    const prepared = await prepare(user.id, parsed.data);
    if ('problem' in prepared) return { ok: false, message: prepared.problem };
    const result = await runSend(prepared.ctx, parsed.data);
    revalidatePath('/rain-day');
    return result;
  } catch (error) {
    logger.error('rain-day: send failed unexpectedly', { code: codeOf(error) });
    return { ok: false, message: SEND_FAILED };
  }
}
