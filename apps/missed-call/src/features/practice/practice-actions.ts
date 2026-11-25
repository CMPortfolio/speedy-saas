'use server';

import { createServerSupabase, createServiceSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { logger } from '@speedy/lib/logger';
import { revalidatePath } from 'next/cache';

import { getMyLine } from '../setup/line-queries';
import {
  clearPractice,
  markPracticeCall,
  sendPracticeReply,
  simulateNewCall,
  simulateRepeatCall,
  type PracticeDeps,
  type PracticeResult,
} from './practice-flow';
import { guardPractice } from './practice-guard';
import { PRACTICE_KEEP_MS } from './practice-state';
import { supabasePracticeStore } from './practice-store';

const log = logger.child({ feature: 'practice' });

/** The page a practice action was started from, so signing in again returns there. */
export type PracticePage = '/setup' | '/calls';

/** What the practice panel shows after an action. */
export type PracticeActionResult = { ok: true; note: string } | { ok: false; message: string };

const FAILED: PracticeActionResult = {
  ok: false,
  message: 'We could not do that just now. Try again in a minute.',
};

/**
 * Every practice action: sign in, read the owner's own line, and refuse unless the saved line has no
 * number at all. The mode is never taken from the request, and the owner id comes only from the
 * session. This file never builds a real SMS provider (see the lint rule on this folder): the
 * practice provider is made inside the flow and writes to the owner's practice rows.
 */
async function practiceAction(
  from: unknown,
  run: (deps: PracticeDeps) => Promise<PracticeResult>,
): Promise<PracticeActionResult> {
  // A signed-out visitor is sent back to the page they were on. Only these two are allowed.
  const user = await requireUser(from === '/calls' ? '/calls' : '/setup');
  try {
    const owner = await createServerSupabase();
    const guarded = guardPractice(await getMyLine(owner));
    if (!guarded.ok) return { ok: false, message: guarded.message };
    const store = supabasePracticeStore(createServiceSupabase(), user.id);
    // Practice rows expire after a week.
    await store.prune(new Date(Date.now() - PRACTICE_KEEP_MS));
    const result = await run({ store, line: guarded.line });
    revalidatePath('/setup');
    revalidatePath('/calls');
    return result.ok ? { ok: true, note: result.note } : { ok: false, message: result.message };
  } catch (error) {
    log.error('practice action failed', { error });
    return FAILED;
  }
}

/**
 * A pretend missed call. With no argument the caller is the next unused practice number, chosen
 * here; with `repeatOfCallId` it is the same caller as one of the owner's own practice calls (to try
 * the 24 hour rule). Nothing else about the caller can be supplied.
 */
export async function practiceCall(
  from: PracticePage,
  repeatOfCallId?: string,
): Promise<PracticeActionResult> {
  return practiceAction(from, (deps) =>
    repeatOfCallId ? simulateRepeatCall(deps, String(repeatOfCallId)) : simulateNewCall(deps),
  );
}

export async function practiceReply(
  from: PracticePage,
  callId: string,
  body: string,
): Promise<PracticeActionResult> {
  return practiceAction(from, (deps) => sendPracticeReply(deps, String(callId), String(body)));
}

export async function practiceMark(
  from: PracticePage,
  callId: string,
  status: 'called_back' | 'booked' | 'junk',
): Promise<PracticeActionResult> {
  return practiceAction(from, (deps) => markPracticeCall(deps, String(callId), status));
}

export async function practiceClear(from: PracticePage): Promise<PracticeActionResult> {
  return practiceAction(from, (deps) => clearPractice(deps));
}
