import { sendPracticeRainDay } from '@/features/practice/actions';

import { sendRainDay } from './actions';

export interface Submitted {
  /** Where to go next, when there is somewhere: the results page, or the practice phone. */
  href?: string;
  error?: string;
}

/**
 * Send the form: for real when the owner has a texting number, to the practice phone when not.
 * The mode is only a hint for which screen to open; the server decides again from the owner's own
 * settings and refuses a practice send for an owner who has a real number.
 */
export async function submitRainDay(
  practice: boolean,
  payload: {
    idempotencyKey: string;
    from: string;
    to: string;
    template: string;
    customerIds: string[];
  },
): Promise<Submitted> {
  if (practice) {
    const result = await sendPracticeRainDay(payload);
    return result.ok
      ? { href: `/rain-day/practice?day=${result.rescheduleId}` }
      : { error: result.message };
  }
  const result = await sendRainDay(payload);
  // Also when the rain day was saved but the texts did not start: the page shows who was not texted.
  if (result.rescheduleId) return { href: `/rain-day/${result.rescheduleId}` };
  return result.ok ? {} : { error: result.message };
}
