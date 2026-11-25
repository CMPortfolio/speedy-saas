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

export type CellProblem = Extract<CellState, { status: 'error' }>;

/**
 * What the confirm form remembers about sending codes, apart from the typed-code result:
 * once any code went out the input stays, a failed resend shows its error without taking the input
 * away, and a new code clears the old "wrong code" message.
 */
export interface CellUi {
  /** When the latest code went out, for the resend countdown. Null until one has. */
  sentAt: number | null;
  message: string;
  sendError: CellProblem | null;
  /** The confirm result that was showing when a new code went out; it is no longer shown. */
  clearedConfirm: CellState | null;
}

export const initialCellUi: CellUi = {
  sentAt: null,
  message: '',
  sendError: null,
  clearedConfirm: null,
};

export function afterSend(ui: CellUi, sent: CellState, confirmState: CellState): CellUi {
  if (sent.status === 'sent') {
    return {
      sentAt: sent.sentAt,
      message: sent.message,
      sendError: null,
      clearedConfirm: confirmState,
    };
  }
  if (sent.status === 'error') return { ...ui, sendError: sent };
  return ui;
}

/** The one error to show: the typed-code result (unless a new code replaced it), else the send error. */
export function visibleProblem(ui: CellUi, confirmState: CellState): CellProblem | null {
  if (confirmState.status === 'error' && confirmState !== ui.clearedConfirm) return confirmState;
  return ui.sendError;
}
