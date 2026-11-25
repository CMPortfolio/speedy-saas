import type { E164 } from '@speedy/lib/phone';
import type { Result } from '@speedy/lib/result';

/**
 * The provider-agnostic contract every SMS adapter implements (`./twilio`, `./fake`).
 * Tools only ever talk to an `SmsProvider`; swapping Twilio for Telnyx or Plivo is a new adapter
 * file, not a change in any tool.
 */

export interface SendTextInput {
  to: E164;
  from: E164;
  body: string;
  /**
   * The provider's sender group for this send (Twilio: a Messaging Service `MG…`). Under A2P 10DLC
   * each business has its own service and campaign, so it is chosen per send, never globally.
   * The text still goes out `from` the number above; the service adds registration, opt-out
   * handling and logs.
   */
  messagingServiceSid?: string;
}

export interface SendTextOutput {
  /** The provider's id for the message (Twilio: `SM…`). Keep it to match delivery events. */
  providerMessageId: string;
}

/** A text someone sent to one of our numbers. */
export interface InboundMessage {
  kind: 'inbound';
  from: E164;
  to: E164;
  body: string;
  providerMessageId: string;
}

export type CallStatus = 'ringing' | 'no-answer' | 'busy' | 'completed' | 'failed' | 'canceled';

/** A call to or from one of our numbers changed state. `no-answer` and `busy` are the missed ones. */
export interface CallStatusEvent {
  kind: 'call';
  callSid: string;
  from: E164;
  to: E164;
  status: CallStatus;
  direction: 'inbound' | 'outbound';
}

export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered';

/** A text we sent moved along; matches `SendTextOutput.providerMessageId`. */
export interface DeliveryEvent {
  kind: 'delivery';
  providerMessageId: string;
  status: DeliveryStatus;
  /** Provider error code when status is failed or undelivered (Twilio: "30003"). */
  errorCode?: string;
}

export type WebhookEvent = InboundMessage | CallStatusEvent | DeliveryEvent;

/**
 * The framework-agnostic shape of an incoming webhook. `url` must be the public URL the provider
 * was given (scheme, host, path and query), because the signature covers it. Header names are
 * matched case-insensitively; see `getHeader`.
 */
export interface WebhookRequest {
  headers: Record<string, string | undefined>;
  rawBody: string;
  url: string;
}

export interface SmsProvider {
  readonly name: string;
  sendText(input: SendTextInput): Promise<Result<SendTextOutput>>;
  /**
   * Turn a verified webhook into an event. Error codes: `ignored_event` for events the tool does
   * not act on (the webhook helper answers 204), `invalid_webhook` for anything unparseable.
   */
  parseInbound(req: WebhookRequest): Result<WebhookEvent>;
  /** True only when the request provably came from the provider. Never log the signature. */
  verifySignature(req: WebhookRequest): boolean;
}

export function getHeader(req: WebhookRequest, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}
