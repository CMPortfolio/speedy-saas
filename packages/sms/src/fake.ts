import { appError, err, ok, type AppError, type Result } from '@speedy/lib/result';

import { fakeSmsForbidden } from './guard';
import {
  getHeader,
  type SendTextInput,
  type SendTextOutput,
  type SmsProvider,
  type WebhookEvent,
  type WebhookRequest,
} from './provider';

/**
 * In-memory provider for tests and local development. Nothing leaves the process. Sends are
 * recorded in `sent`; `inbound(event)` builds a signed webhook request a route can be fed with.
 */

export const FAKE_SIGNATURE_HEADER = 'x-speedy-fake-signature';
export const FAKE_SIGNATURE = 'fake-signature-ok';

export interface SentText extends SendTextInput {
  providerMessageId: string;
  sentAt: Date;
}

export interface FakeProvider extends SmsProvider {
  readonly name: 'fake';
  /** Every text sent through this provider, oldest first. */
  readonly sent: SentText[];
  /** Build a correctly signed webhook request carrying `event`, for `handleWebhook` or a route. */
  inbound(event: WebhookEvent, url?: string): WebhookRequest;
  /** Make the next `sendText` fail with this error (default `provider_failed`). */
  failNext(error?: AppError): void;
  /** Forget sent texts and pending failures. */
  reset(): void;
}

export interface FakeProviderOptions {
  /**
   * Prefix of the generated message ids (default `FAKE`, giving FAKE0001, FAKE0002...). The counter
   * is per provider, so test files that run in parallel against one shared database and record
   * the ids in a unique column pass their own prefix to keep the ids from colliding.
   */
  idPrefix?: string;
}

export function fakeProvider(options: FakeProviderOptions = {}): FakeProvider {
  const idPrefix = options.idPrefix ?? 'FAKE';
  const forbidden = fakeSmsForbidden();
  if (forbidden) throw new Error(forbidden);
  const sent: SentText[] = [];
  let nextFailure: AppError | undefined;
  let counter = 0;

  return {
    name: 'fake',
    sent,

    async sendText(input: SendTextInput): Promise<Result<SendTextOutput>> {
      if (nextFailure) {
        const error = nextFailure;
        nextFailure = undefined;
        return err(error);
      }
      counter += 1;
      const providerMessageId = `${idPrefix}${String(counter).padStart(4, '0')}`;
      sent.push({ ...input, providerMessageId, sentAt: new Date() });
      return ok({ providerMessageId });
    },

    parseInbound(req: WebhookRequest): Result<WebhookEvent> {
      try {
        const parsed = JSON.parse(req.rawBody) as Partial<WebhookEvent>;
        if (parsed.kind === 'inbound' || parsed.kind === 'call' || parsed.kind === 'delivery') {
          return ok(parsed as WebhookEvent);
        }
        return err(appError('invalid_webhook', 'Fake webhook without a known kind.'));
      } catch (e) {
        return err(appError('invalid_webhook', 'Fake webhook body is not JSON.', e));
      }
    },

    verifySignature(req: WebhookRequest): boolean {
      return getHeader(req, FAKE_SIGNATURE_HEADER) === FAKE_SIGNATURE;
    },

    inbound(event, url = 'http://localhost/api/sms/inbound') {
      return {
        headers: { [FAKE_SIGNATURE_HEADER]: FAKE_SIGNATURE, 'content-type': 'application/json' },
        rawBody: JSON.stringify(event),
        url,
      };
    },

    failNext(error = appError('provider_failed', 'Could not send the text.')) {
      nextFailure = error;
    },

    reset() {
      sent.length = 0;
      nextFailure = undefined;
      counter = 0;
    },
  };
}
