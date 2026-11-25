import { createHmac, timingSafeEqual } from 'node:crypto';

import { logger } from '@speedy/lib/logger';
import { maskUsPhone, normalizeUsPhone, type E164 } from '@speedy/lib/phone';
import { appError, err, ok, type Result } from '@speedy/lib/result';
import twilio from 'twilio';

import {
  getHeader,
  type CallStatus,
  type CallStatusEvent,
  type DeliveryEvent,
  type DeliveryStatus,
  type InboundMessage,
  type SendTextInput,
  type SendTextOutput,
  type SmsProvider,
  type WebhookEvent,
  type WebhookRequest,
} from './provider';

/**
 * Twilio adapter. Sending goes through the `twilio` SDK (Messages API); webhook verification is
 * Twilio's HMAC-SHA1 over the public URL plus the sorted form fields, implemented here with
 * node:crypto so tests run offline. Twilio is the default assumption until Chris picks a provider.
 */

export const TWILIO_SIGNATURE_HEADER = 'x-twilio-signature';

/** The slice of the Twilio client we use. Tests inject a fake; production uses `twilio()`. */
export interface TwilioMessagesClient {
  messages: {
    create(params: {
      to: string;
      body: string;
      from?: string;
      messagingServiceSid?: string;
      statusCallback?: string;
    }): Promise<{ sid: string }>;
  };
}

export interface TwilioProviderOptions {
  accountSid: string;
  authToken: string;
  /** Public URL Twilio posts delivery events to (the tool's `/api/sms/status`). */
  statusCallbackUrl?: string;
  /** Replace the SDK client (tests). */
  client?: TwilioMessagesClient;
}

type FormParams = Record<string, string | string[]>;

export function parseFormBody(rawBody: string): FormParams {
  const params: FormParams = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    const existing = params[key];
    if (existing === undefined) params[key] = value;
    else params[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return params;
}

function paramString(key: string, value: string | string[]): string {
  if (Array.isArray(value)) {
    return Array.from(new Set(value))
      .sort()
      .map((v) => key + v)
      .join('');
  }
  return key + value;
}

/** Twilio's expected `X-Twilio-Signature`: base64(HMAC-SHA1(authToken, url + sorted "keyvalue" pairs)). */
export function twilioSignature(authToken: string, url: string, params: FormParams): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + paramString(key, params[key] ?? ''), url);
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

/** Twilio may sign with or without an explicit default port; accept both spellings. */
function urlCandidates(url: string): string[] {
  try {
    const u = new URL(url);
    const defaultPort = u.protocol === 'https:' ? '443' : '80';
    const withPort = `${u.protocol}//${u.hostname}:${u.port || defaultPort}${u.pathname}${u.search}`;
    const withoutPort = `${u.protocol}//${u.hostname}${u.pathname}${u.search}`;
    return Array.from(new Set([url, withPort, withoutPort]));
  } catch {
    return [url];
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifyTwilioSignature(authToken: string, req: WebhookRequest): boolean {
  const header = getHeader(req, TWILIO_SIGNATURE_HEADER);
  if (!header) return false;
  const params = parseFormBody(req.rawBody);
  return urlCandidates(req.url).some((url) =>
    safeEqual(header, twilioSignature(authToken, url, params)),
  );
}

const CALL_STATUS: Record<string, CallStatus> = {
  queued: 'ringing',
  initiated: 'ringing',
  ringing: 'ringing',
  'no-answer': 'no-answer',
  busy: 'busy',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',
};

const DELIVERY_STATUS: Record<string, DeliveryStatus> = {
  accepted: 'queued',
  scheduled: 'queued',
  queued: 'queued',
  sending: 'queued',
  sent: 'sent',
  delivered: 'delivered',
  read: 'delivered',
  failed: 'failed',
  undelivered: 'undelivered',
};

function first(params: FormParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

function ignored(why: string) {
  return err(appError('ignored_event', 'Nothing to do for this event.', why));
}

function phones(params: FormParams): Result<{ from: E164; to: E164 }> {
  // Twilio always sends real numbers as +E.164. Anything else ("anonymous", "restricted",
  // "+266696687") is a hidden caller id, and must not go through normalizeUsPhone, which would turn
  // letters into keypad digits and invent a number.
  const raw = (key: string) => {
    const v = first(params, key) ?? '';
    return /^\+1\d{10}$/.test(v) ? v : '';
  };
  const from = normalizeUsPhone(raw('From'));
  const to = normalizeUsPhone(raw('To'));
  if (!from || !to) return ignored(`non-US or missing From/To`);
  return ok({ from, to });
}

function parseDelivery(params: FormParams): Result<DeliveryEvent> {
  const sid = first(params, 'MessageSid') ?? first(params, 'SmsSid');
  const raw = first(params, 'MessageStatus') ?? '';
  const status = DELIVERY_STATUS[raw];
  if (!sid) return err(appError('invalid_webhook', 'Delivery event without MessageSid.'));
  if (!status) return ignored(`message status ${raw}`);
  const errorCode = first(params, 'ErrorCode');
  return ok({
    kind: 'delivery',
    providerMessageId: sid,
    status,
    ...(errorCode ? { errorCode } : {}),
  });
}

function parseCall(params: FormParams): Result<CallStatusEvent> {
  const callSid = first(params, 'CallSid') ?? '';
  const raw = first(params, 'CallStatus') ?? '';
  const status = CALL_STATUS[raw];
  if (!status) return ignored(`call status ${raw}`);
  const p = phones(params);
  if (!p.ok) return p;
  const direction = (first(params, 'Direction') ?? 'inbound').startsWith('outbound')
    ? 'outbound'
    : 'inbound';
  return ok({ kind: 'call', callSid, status, direction, ...p.value });
}

function parseInboundText(params: FormParams): Result<InboundMessage> {
  const sid = first(params, 'MessageSid') ?? first(params, 'SmsSid') ?? '';
  const p = phones(params);
  if (!p.ok) return p;
  return ok({
    kind: 'inbound',
    body: first(params, 'Body') ?? '',
    providerMessageId: sid,
    ...p.value,
  });
}

/** Classify a Twilio form post: delivery status, call status, or an inbound text. */
export function parseTwilioWebhook(rawBody: string): Result<WebhookEvent> {
  const params = parseFormBody(rawBody);
  if (first(params, 'MessageStatus') !== undefined) return parseDelivery(params);
  if (first(params, 'CallSid') && first(params, 'CallStatus')) return parseCall(params);
  if (first(params, 'MessageSid') ?? first(params, 'SmsSid')) return parseInboundText(params);
  return err(appError('invalid_webhook', 'Not a Twilio message or call webhook.'));
}

/** Map the Twilio errors a tool can act on; everything else is `provider_failed`. */
function sendError(e: unknown) {
  const code = (e as { code?: number } | null)?.code;
  if (code === 21610) return appError('opted_out', 'This number has opted out of texts.', e);
  if (code === 21211 || code === 21614)
    return appError('invalid_number', 'That number cannot receive texts.', e);
  return appError('provider_failed', 'Could not send the text.', e);
}

export function twilioProvider(options: TwilioProviderOptions): SmsProvider {
  const log = logger.child({ pkg: 'sms', provider: 'twilio' });
  const client: TwilioMessagesClient =
    options.client ?? twilio(options.accountSid, options.authToken);

  return {
    name: 'twilio',

    async sendText(input: SendTextInput): Promise<Result<SendTextOutput>> {
      // Always from the line's own number. A Messaging Service, when the send names one, rides
      // along so the message is recorded against that business's registered campaign.
      const route = {
        from: input.from,
        ...(input.messagingServiceSid ? { messagingServiceSid: input.messagingServiceSid } : {}),
      };
      const callback = options.statusCallbackUrl
        ? { statusCallback: options.statusCallbackUrl }
        : {};
      try {
        const message = await client.messages.create({
          to: input.to,
          body: input.body,
          ...route,
          ...callback,
        });
        log.info('text sent', {
          to: maskUsPhone(input.to),
          sid: message.sid,
          service: input.messagingServiceSid,
        });
        return ok({ providerMessageId: message.sid });
      } catch (e) {
        const error = sendError(e);
        log.warn('text failed', { to: maskUsPhone(input.to), code: error.code });
        return err(error);
      }
    },

    parseInbound(req: WebhookRequest): Result<WebhookEvent> {
      return parseTwilioWebhook(req.rawBody);
    },

    verifySignature(req: WebhookRequest): boolean {
      return verifyTwilioSignature(options.authToken, req);
    },
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';

/** TwiML that ends the call at once. Return it from the voice webhook when the owner can't pick up. */
export function twimlHangup(): string {
  return `${XML_HEADER}<Response><Hangup/></Response>`;
}

/** TwiML that reads `text` to the caller, then ends the call. */
export function twimlSay(text: string): string {
  return `${XML_HEADER}<Response><Say>${escapeXml(text)}</Say><Hangup/></Response>`;
}

export const TWIML_CONTENT_TYPE = 'text/xml; charset=utf-8';
