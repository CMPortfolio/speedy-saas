import { describe, expect, it } from 'vitest';

import { displayStatus } from '@/features/practice/status';

const sentAt = '2026-12-01T15:00:00.000Z';
const at = (ms: number) => new Date(new Date(sentAt).getTime() + ms);

describe('displayStatus (the simulated delivery on the practice phone)', () => {
  it('moves queued to sent to delivered as time passes', () => {
    expect(displayStatus('sent', sentAt, at(100))).toBe('queued');
    expect(displayStatus('sent', sentAt, at(2000))).toBe('sent');
    expect(displayStatus('sent', sentAt, at(6000))).toBe('delivered');
  });

  it('leaves skipped and replied alone', () => {
    expect(displayStatus('skipped', sentAt, at(100))).toBe('skipped');
    expect(displayStatus('replied', sentAt, at(100))).toBe('replied');
  });

  it('says whether anything is still in flight', async () => {
    const { stillMoving } = await import('@/features/practice/status');
    expect(stillMoving([{ status: 'sent', created_at: sentAt }], at(100))).toBe(true);
    expect(stillMoving([{ status: 'sent', created_at: sentAt }], at(6000))).toBe(false);
    expect(stillMoving([{ status: 'skipped', created_at: sentAt }], at(100))).toBe(false);
  });
});
