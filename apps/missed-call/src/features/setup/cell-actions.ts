'use server';

import { createServiceSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { logger } from '@speedy/lib/logger';
import { revalidatePath } from 'next/cache';

import { getSms } from '@/config/sms';

import type { CellOutcome } from './cell-verifier';
import { createOwnerCellVerifier } from './cell-verifier';
import type { CellState } from './cell-state';
import { createLineAccess, createVerifyStore } from './verify-store';

const log = logger.child({ feature: 'cell-confirmation' });

function verifier() {
  const service = createServiceSupabase();
  return createOwnerCellVerifier({
    provider: getSms(),
    store: createVerifyStore(service),
    ...createLineAccess(service),
  });
}

const FAILED: CellState = {
  status: 'error',
  code: 'unexpected',
  message: 'We could not do that just now. Try again in a minute.',
};

function toState(outcome: CellOutcome, kind: 'sent' | 'confirmed'): CellState {
  if (!outcome.ok) return { status: 'error', code: outcome.code, message: outcome.message };
  return kind === 'sent'
    ? { status: 'sent', message: outcome.message, sentAt: Date.now() }
    : { status: 'confirmed', message: outcome.message };
}

/** "Send code": texts a 6-digit code to the cell on the owner's line. */
export async function sendCellCode(): Promise<CellState> {
  const user = await requireUser('/setup');
  try {
    return toState(await verifier().start(user.id), 'sent');
  } catch (error) {
    log.error('send cell code failed', { error });
    return FAILED;
  }
}

/** "Confirm": checks the typed code and, if right, confirms the cell (service role, after re-checking the cell). */
export async function confirmCellCode(_prev: CellState, formData: FormData): Promise<CellState> {
  const user = await requireUser('/setup');
  try {
    const outcome = await verifier().confirm(user.id, String(formData.get('code') ?? ''));
    if (outcome.ok) revalidatePath('/setup');
    return toState(outcome, 'confirmed');
  } catch (error) {
    log.error('confirm cell code failed', { error });
    return FAILED;
  }
}
