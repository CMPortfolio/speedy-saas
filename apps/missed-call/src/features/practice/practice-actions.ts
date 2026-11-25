'use server';

import { createServerSupabase, createServiceSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { logger } from '@speedy/lib/logger';
import { revalidatePath } from 'next/cache';

import { env } from '@/config/env';

import { getMyLine } from '../setup/line-queries';
import { nextPracticeCaller } from './numbers';
import {
  clearPractice,
  markPracticeCall,
  sendPracticeReply,
  simulateMissedCall,
  type PracticeDeps,
  type PracticeResult,
} from './practice-flow';
import { guardPractice } from './practice-guard';
import { readPractice } from './practice-state';
import { supabasePracticeStore } from './practice-store';

const log = logger.child({ feature: 'practice' });

/** What the practice panel shows after an action. */
export type PracticeActionResult = { ok: true; note: string } | { ok: false; message: string };

const FAILED: PracticeActionResult = {
  ok: false,
  message: 'We could not do that just now. Try again in a minute.',
};

/**
 * Every practice action: sign in, read the owner's own line, and refuse unless the server itself
 * says the line has no real number. The mode is never taken from the request.
 */
async function practiceAction(
  run: (
    deps: PracticeDeps,
    owner: Awaited<ReturnType<typeof createServerSupabase>>,
  ) => Promise<PracticeResult>,
): Promise<PracticeActionResult> {
  const user = await requireUser('/setup');
  try {
    const owner = await createServerSupabase();
    const guarded = guardPractice(await getMyLine(owner), {
      smsProvider: env.SMS_PROVIDER,
      nodeEnv: env.NODE_ENV,
    });
    if (!guarded.ok) return { ok: false, message: guarded.message };
    const store = supabasePracticeStore(createServiceSupabase(), user.id);
    const result = await run({ store, line: guarded.line }, owner);
    revalidatePath('/setup');
    revalidatePath('/calls');
    return result.ok ? { ok: true, note: result.note } : { ok: false, message: result.message };
  } catch (error) {
    log.error('practice action failed', { error });
    return FAILED;
  }
}

/** A pretend missed call: from a new practice number, or again from `callerNumber` (to see the 24 hour rule). */
export async function practiceCall(callerNumber?: string): Promise<PracticeActionResult> {
  return practiceAction(async (deps, owner) => {
    if (callerNumber) return simulateMissedCall(deps, callerNumber);
    const used = (await readPractice(owner)).calls.map((c) => c.callerNumber);
    return simulateMissedCall(deps, nextPracticeCaller(used));
  });
}

export async function practiceReply(callId: string, body: string): Promise<PracticeActionResult> {
  return practiceAction((deps) => sendPracticeReply(deps, String(callId), String(body)));
}

export async function practiceMark(
  callId: string,
  status: 'called_back' | 'booked' | 'junk',
): Promise<PracticeActionResult> {
  return practiceAction((deps) => markPracticeCall(deps, String(callId), status));
}

export async function practiceClear(): Promise<PracticeActionResult> {
  return practiceAction((deps) => clearPractice(deps));
}
