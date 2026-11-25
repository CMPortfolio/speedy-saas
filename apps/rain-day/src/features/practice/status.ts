/** How long a practice text shows as queued, then sent, before it shows as delivered. */
const QUEUED_MS = 1500;
const SENT_MS = 4000;

export type PracticeStatus = 'queued' | 'sent' | 'delivered' | 'skipped' | 'replied' | 'received';

/**
 * The status the practice phone shows. Practice texts are stored as "sent"; delivery is simulated
 * from their age so the owner sees queued, sent, delivered one after the other. Nothing is written.
 */
export function displayStatus(stored: string, createdAt: string, now: Date): PracticeStatus {
  if (stored !== 'sent') return stored as PracticeStatus;
  const age = now.getTime() - new Date(createdAt).getTime();
  if (age < QUEUED_MS) return 'queued';
  if (age < SENT_MS) return 'sent';
  return 'delivered';
}

/** True while some practice text is still on its way to "delivered", so the page keeps refreshing. */
export function stillMoving(
  rows: readonly { status: string; created_at: string }[],
  now: Date,
): boolean {
  return rows.some((r) => {
    const shown = displayStatus(r.status, r.created_at, now);
    return shown === 'queued' || shown === 'sent';
  });
}
