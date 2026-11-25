import { logger } from '@speedy/lib/logger';
import type { E164 } from '@speedy/lib/phone';
import type { SmsProvider } from '@speedy/sms/provider';
import { sendFirstOrFollowup } from '@speedy/sms/send';

export interface DispatchRow {
  /** reschedule_messages.id */
  id: string;
  customerId: string | null;
  phone: E164;
  body: string;
  isFirstContact: boolean;
}

export type DispatchResult =
  | { status: 'sent'; providerMessageId: string }
  | { status: 'failed'; errorCode: string }
  | { status: 'skipped' };

export interface DispatchStore {
  /** Fresh read, right before the send: a STOP that landed a minute ago still counts. */
  isOptedOut(phone: E164): Promise<boolean>;
  markResult(messageId: string, result: DispatchResult): Promise<void>;
}

export interface DispatchOutcome {
  sent: number;
  failed: number;
  skipped: number;
}

const log = logger.child({ feature: 'rain-day-dispatch' });

/**
 * Text each row on its own, through the provider, one recipient per call. Never retries a send:
 * a text that might have gone out is never sent twice. A few run at once so a big list
 * does not take minutes.
 */
export async function dispatchMessages(input: {
  provider: SmsProvider;
  store: DispatchStore;
  rows: readonly DispatchRow[];
  from: E164;
  businessName: string;
  concurrency?: number;
}): Promise<DispatchOutcome> {
  const outcome: DispatchOutcome = { sent: 0, failed: 0, skipped: 0 };
  const queue = [...input.rows];

  async function save(id: string, result: DispatchResult) {
    try {
      await input.store.markResult(id, result);
    } catch (error) {
      // The text already went (or was deliberately not sent); the delivery webhook can still
      // update the row by provider id. Do not let one bad write stop the rest of the list.
      log.error('could not save message result', { messageId: id, status: result.status, error });
    }
  }

  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const result = await sendFirstOrFollowup(
        input.provider,
        {
          isOptedOut: (n) => input.store.isOptedOut(n),
          setOptedOut: async () => undefined,
        },
        {
          to: row.phone,
          from: input.from,
          body: row.body,
          businessName: input.businessName,
          isFirstContact: row.isFirstContact,
        },
      );
      if (result.ok) {
        outcome.sent += 1;
        await save(row.id, { status: 'sent', providerMessageId: result.value.providerMessageId });
      } else if (result.error.code === 'opted_out') {
        outcome.skipped += 1;
        await save(row.id, { status: 'skipped' });
      } else {
        outcome.failed += 1;
        await save(row.id, { status: 'failed', errorCode: result.error.code });
      }
    }
  }

  const workers = Math.max(1, Math.min(input.concurrency ?? 5, queue.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return outcome;
}
