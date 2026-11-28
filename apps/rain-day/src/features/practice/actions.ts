'use server';

import { createServerSupabase, createServiceSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { getProfile } from '@speedy/db/core';
import { logger } from '@speedy/lib/logger';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  listContactedCustomerIds,
  listCustomersForDay,
  listOptedOutPhones,
} from '@/features/rain-day/queries';
import { sendInputSchema } from '@/features/rain-day/schema';
import { getOwnerSettings } from '@/features/settings/owner-cell';
import { todayInNewYork, weekdayOf } from '@/lib/dates';
import { codeOf } from '@/lib/error-code';

import {
  clearPractice,
  replyPractice,
  sendPractice,
  type PracticeContext,
  type PracticeResult,
} from './core';
import { listPracticeOptedOutIds } from './queries';

const FAILED = 'We could not do that just now. Try again in a minute.';
const NEEDS_BUSINESS = 'Add your business name in Settings first. Customers see it in the text.';

/**
 * Everything here runs on the server for the signed-in owner. Whether they are in practice mode
 * is read from their own settings inside `core`; nothing the browser sends can switch it on.
 */
async function context(userId: string) {
  const db = await createServerSupabase();
  const ctx: PracticeContext = {
    service: createServiceSupabase(),
    ownerId: userId,
    settings: await getOwnerSettings(db),
  };
  return { db, ctx };
}

/** "Send as practice": the same flow as a real send, shown on the practice phone. */
export async function sendPracticeRainDay(
  input: unknown,
): Promise<PracticeResult<{ rescheduleId: string }>> {
  const user = await requireUser('/rain-day');
  const parsed = sendInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Check the form and try again.',
    };
  }
  const request = parsed.data;
  const today = todayInNewYork();
  if (request.to < today) return { ok: false, message: 'Pick a new day that is today or later.' };
  try {
    const { db, ctx } = await context(user.id);
    const businessName = (await getProfile(db, user.id))?.business_name?.trim();
    if (!businessName) return { ok: false, message: NEEDS_BUSINESS };
    const [customers, realOptedOutPhones, practiceOptedOutIds, contactedIds] = await Promise.all([
      listCustomersForDay(db, weekdayOf(request.from)),
      listOptedOutPhones(db),
      listPracticeOptedOutIds(db),
      listContactedCustomerIds(db),
    ]);
    const result = await sendPractice(
      ctx,
      { customers, realOptedOutPhones, practiceOptedOutIds, contactedIds, businessName, today },
      request,
    );
    revalidatePath('/rain-day/practice');
    return result.ok ? { ok: true, rescheduleId: result.rescheduleId } : result;
  } catch (error) {
    logger.error('rain-day: practice send failed', { code: codeOf(error) });
    return { ok: false, message: FAILED };
  }
}

const replySchema = z.object({
  rescheduleId: z.uuid(),
  customerId: z.uuid(),
  body: z.string().trim().min(1, 'Type a reply first.').max(1600, 'Keep the reply shorter.'),
});

/** A reply typed on the practice phone as the customer (or STOP, START, HELP). */
export async function sendPracticeReply(
  input: unknown,
): Promise<PracticeResult<{ forwarded: boolean }>> {
  const user = await requireUser('/rain-day/practice');
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the reply.' };
  }
  try {
    const { db, ctx } = await context(user.id);
    const businessName = (await getProfile(db, user.id))?.business_name?.trim() || 'Your business';
    const result = await replyPractice(ctx, {
      rescheduleId: parsed.data.rescheduleId,
      customerId: parsed.data.customerId,
      body: parsed.data.body,
      businessName,
    });
    revalidatePath('/rain-day/practice');
    return result;
  } catch (error) {
    logger.error('rain-day: practice reply failed', { code: codeOf(error) });
    return { ok: false, message: FAILED };
  }
}

/** Remove the owner's practice rain days, bubbles and practice STOPs. Real data is untouched. */
export async function clearPracticePhone(): Promise<PracticeResult> {
  const user = await requireUser('/rain-day/practice');
  try {
    const result = await clearPractice({ service: createServiceSupabase(), ownerId: user.id });
    revalidatePath('/rain-day/practice');
    revalidatePath('/rain-day');
    return result.ok ? { ok: true } : result;
  } catch (error) {
    logger.error('rain-day: clear practice failed', { code: codeOf(error) });
    return { ok: false, message: FAILED };
  }
}
