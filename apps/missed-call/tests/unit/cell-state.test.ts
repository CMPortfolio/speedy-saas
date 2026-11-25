import { describe, expect, it } from 'vitest';

import {
  afterSend,
  initialCellUi,
  visibleProblem,
  type CellState,
} from '../../src/features/setup/cell-state';

const sent = (at: number): CellState => ({
  status: 'sent',
  message: 'We texted a code.',
  sentAt: at,
});
const wrong: CellState = {
  status: 'error',
  code: 'wrong',
  message: 'That code is not right. 4 tries left.',
};
const tooMany: CellState = {
  status: 'error',
  code: 'rate_limited',
  message: 'Too many codes sent for now. Try again later.',
};

describe('confirm form state', () => {
  it('shows nothing before anything happens', () => {
    expect(visibleProblem(initialCellUi, { status: 'idle' })).toBeNull();
  });

  it('keeps the code input once a code went out and remembers when', () => {
    const ui = afterSend(initialCellUi, sent(1000), { status: 'idle' });
    expect(ui.sentAt).toBe(1000);
    expect(ui.message).toBe('We texted a code.');
  });

  it('a new code clears the old wrong-code message', () => {
    const first = afterSend(initialCellUi, sent(1000), { status: 'idle' });
    expect(visibleProblem(first, wrong)).toEqual(wrong);
    const second = afterSend(first, sent(40_000), wrong);
    expect(visibleProblem(second, wrong)).toBeNull();
    // A new wrong code afterwards is shown again.
    const again: CellState = { ...wrong, message: 'That code is not right. 3 tries left.' };
    expect(visibleProblem(second, again)).toEqual(again);
  });

  it('a failed resend keeps the input and shows the send error next to it', () => {
    const first = afterSend(initialCellUi, sent(1000), { status: 'idle' });
    const failed = afterSend(first, tooMany, { status: 'idle' });
    expect(failed.sentAt).toBe(1000);
    expect(visibleProblem(failed, { status: 'idle' })).toEqual(tooMany);
  });

  it('a wrong typed code wins over an older send error; a good resend clears the send error', () => {
    const first = afterSend(initialCellUi, sent(1000), { status: 'idle' });
    const failed = afterSend(first, tooMany, { status: 'idle' });
    expect(visibleProblem(failed, wrong)).toEqual(wrong);
    const recovered = afterSend(failed, sent(90_000), { status: 'idle' });
    expect(visibleProblem(recovered, { status: 'idle' })).toBeNull();
  });

  it('a failed first send leaves the input hidden', () => {
    const ui = afterSend(initialCellUi, tooMany, { status: 'idle' });
    expect(ui.sentAt).toBeNull();
    expect(visibleProblem(ui, { status: 'idle' })).toEqual(tooMany);
  });
});
