'use server';

import { createServerSupabase, createServiceSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { logger } from '@speedy/lib/logger';
import { isUsDomesticPhone, normalizeUsPhone } from '@speedy/lib/phone';
import { checkPhoneVerification, startPhoneVerification } from '@speedy/sms/verify-phone';
import { revalidatePath } from 'next/cache';

import { getSms, devDefaultSender } from '@/config/sms';
import { codeOf } from '@/lib/error-code';

import {
  getOwnerSettings,
  NO_SENDER_MESSAGE,
  removeVerifiedCell,
  saveVerifiedCell,
} from './owner-cell';
import { resolveSender, serviceOf, type Sender } from './sender';
import { createVerifyStore } from './verify-store';

export type CellResult = { ok: true; message?: string } | { ok: false; message: string };

const FAILED = 'We could not do that just now. Try again in a minute.';

async function senderForCode(providerName: string): Promise<Sender | null> {
  const settings = await getOwnerSettings(await createServerSupabase());
  const own = resolveSender(settings, providerName);
  if (own) return own;
  const fallback = providerName === 'fake' ? devDefaultSender() : null;
  return fallback ? { from: fallback } : null;
}

/** Text a 6-digit code to the number the owner typed. Three codes an hour, six a day. */
export async function sendCellCode(phone: string): Promise<CellResult> {
  const user = await requireUser('/settings');
  const cell = normalizeUsPhone(phone);
  if (!cell) return { ok: false, message: 'Enter a 10-digit US cell number.' };
  // Texting Canada and the Caribbean is billed as international, so US area codes only.
  if (!isUsDomesticPhone(cell)) return { ok: false, message: 'Rain Day texts US numbers only.' };
  try {
    // The code comes from the owner's own number and Messaging Service, like every other text;
    // the dev default exists only for the fake provider.
    const provider = getSms();
    const sender = await senderForCode(provider.name);
    if (!sender) return { ok: false, message: NO_SENDER_MESSAGE };
    const result = await startPhoneVerification(
      { provider, store: createVerifyStore(createServiceSupabase()) },
      {
        subject: user.id,
        phone: cell,
        from: sender.from,
        ...serviceOf(sender),
        message: (code) => `Your Rain Day code is ${code}. It expires in 10 minutes.`,
      },
    );
    if (result.ok) return { ok: true, message: 'We texted you a code. It lasts 10 minutes.' };
    if (result.error.code === 'rate_limited') return { ok: false, message: result.error.message };
    if (result.error.code === 'invalid_number') {
      return { ok: false, message: 'That number cannot receive texts.' };
    }
    return { ok: false, message: FAILED };
  } catch (error) {
    logger.error('rain-day: send cell code failed', { code: codeOf(error) });
    return { ok: false, message: FAILED };
  }
}

const VERIFY_MESSAGES = {
  wrong: (left: number) => `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
  expired: 'That code expired. Send a new one.',
  locked: 'Too many wrong tries. Send a new code.',
  none: 'Send a code first.',
} as const;

/** Check the typed code; on success the number becomes the one replies are forwarded to. */
export async function confirmCellCode(code: string): Promise<CellResult> {
  const user = await requireUser('/settings');
  try {
    const service = createServiceSupabase();
    const outcome = await checkPhoneVerification(
      { store: createVerifyStore(service) },
      { subject: user.id, code },
    );
    if (outcome.status === 'verified') {
      await saveVerifiedCell(service, user.id, outcome.phone);
      revalidatePath('/settings');
      return { ok: true, message: 'Done. Customer replies will be texted to this number.' };
    }
    if (outcome.status === 'wrong')
      return { ok: false, message: VERIFY_MESSAGES.wrong(outcome.attemptsLeft) };
    return { ok: false, message: VERIFY_MESSAGES[outcome.status] };
  } catch (error) {
    logger.error('rain-day: confirm cell code failed', { code: codeOf(error) });
    return { ok: false, message: FAILED };
  }
}

/** Stop forwarding. Replies are still kept and listed. */
export async function removeCell(): Promise<CellResult> {
  const user = await requireUser('/settings');
  try {
    await removeVerifiedCell(createServiceSupabase(), user.id);
    revalidatePath('/settings');
    return { ok: true };
  } catch (error) {
    logger.error('rain-day: remove cell failed', { code: codeOf(error) });
    return { ok: false, message: FAILED };
  }
}
