import { logger } from '@speedy/lib/logger';
import { isUsDomesticPhone, type E164 } from '@speedy/lib/phone';
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
  | { status: 'skipped'; errorCode: 'opted_out' | 'non_us' };

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

/** Most texts in flight at once. */
export const MAX_CONCURRENT_SENDS = 5;

const log = logger.child({ feature: 'rain-day-dispatch' });

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null
    ? (error as { code?: string }).code
    : undefined;
}

/**
 * Text each row on its own, through the provider, one recipient per call. Never retries a send:
 * a text that might have gone out is never sent twice. Up to MAX_CONCURRENT_SENDS run at once so
 * a big list does not take minutes. One row failing for any reason never stops the others: it is
 * marked failed ('internal') and the worker moves on.
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
      log.error('could not save message result', {
        messageId: id,
        status: result.status,
        code: codeOf(error),
      });
    }
  }

  async function sendRow(row: DispatchRow) {
    if (!isUsDomesticPhone(row.phone)) {
      outcome.skipped += 1;
      await save(row.id, { status: 'skipped', errorCode: 'non_us' });
      return;
    }
    const result = await sendFirstOrFollowup(
      input.provider,
      { isOptedOut: (n) => input.store.isOptedOut(n), setOptedOut: async () => undefined },
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
      await save(row.id, { status: 'skipped', errorCode: 'opted_out' });
    } else {
      outcome.failed += 1;
      await save(row.id, { status: 'failed', errorCode: result.error.code });
    }
  }

  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      try {
        await sendRow(row);
      } catch (error) {
        // Thrown before the provider call returned (for example the opt-out lookup). Nothing
        // went out for this row, so it is marked failed and the rest carry on.
        log.error('send step threw', { messageId: row.id, code: codeOf(error) });
        outcome.failed += 1;
        await save(row.id, { status: 'failed', errorCode: 'internal' });
      }
    }
  }

  const workers = Math.max(1, Math.min(input.concurrency ?? MAX_CONCURRENT_SENDS, queue.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return outcome;
}
