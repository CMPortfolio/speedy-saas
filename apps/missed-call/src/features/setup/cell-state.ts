import type { CellFailure } from './cell-verifier';

/** What the confirm-your-cell form reports back. Client-safe: no server code in here. */
export type CellState =
  | { status: 'idle' }
  | { status: 'sent'; message: string; sentAt: number }
  | { status: 'confirmed'; message: string }
  | { status: 'error'; code: CellFailure | 'unexpected'; message: string };

export const idleCell: CellState = { status: 'idle' };

/** After "Send code" the resend button waits this long (the server also allows three an hour). */
export const RESEND_SECONDS = 30;
