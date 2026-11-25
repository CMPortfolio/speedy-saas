import { logger } from '@speedy/lib/logger';
import { maskUsPhone, type E164 } from '@speedy/lib/phone';
import { appError, err, ok, type Result } from '@speedy/lib/result';

import type {
  SendTextInput,
  SendTextOutput,
  SmsProvider,
  WebhookEvent,
  WebhookRequest,
} from './provider';

/**
 * The practice provider: every text a tool would send is handed to a `PracticeSink` (the tool's own
 * practice table) so an owner can read it on an on-screen phone. Nothing is texted to anyone.
 *
 * This file must never be able to reach a carrier. It imports no SDK and opens no connection, only
 * types from this package and the shared helpers; a test reads this source and fails if that
 * changes. It is chosen by the tool from the owner's own state on the server (a line with no real
 * number yet), never from anything the browser sends. It is not the fake provider and does not
 * relax any of its guards.
 */
export interface PracticeMessage {
  to: E164;
  from: E164;
  body: string;
  messagingServiceSid?: string;
}

export interface PracticeSink {
  /** Save one practice text for the owner it belongs to. The tool scopes the sink to that owner. */
  add(message: PracticeMessage): Promise<{ id: string }>;
}

const log = logger.child({ pkg: 'sms', provider: 'practice' });

export interface PracticeProvider extends SmsProvider {
  readonly name: 'practice';
}

export function practiceProvider(sink: PracticeSink): PracticeProvider {
  return {
    name: 'practice',

    async sendText(input: SendTextInput): Promise<Result<SendTextOutput>> {
      try {
        const saved = await sink.add({
          to: input.to,
          from: input.from,
          body: input.body,
          ...(input.messagingServiceSid ? { messagingServiceSid: input.messagingServiceSid } : {}),
        });
        return ok({ providerMessageId: `practice-${saved.id}` });
      } catch (e) {
        const known = (e as { code?: unknown } | null)?.code;
        if (typeof known === 'string' && 'message' in (e as object)) {
          return err(appError(known, String((e as { message: unknown }).message)));
        }
        log.warn('practice text not saved', { to: maskUsPhone(input.to), error: e });
        return err(appError('provider_failed', 'Could not save the practice text.', e));
      }
    },

    // Practice has no webhooks. A request that claims to be one is never trusted.
    parseInbound(_req: WebhookRequest): Result<WebhookEvent> {
      return err(appError('invalid_webhook', 'Practice mode has no webhooks.'));
    },

    verifySignature(_req: WebhookRequest): boolean {
      return false;
    },
  };
}
