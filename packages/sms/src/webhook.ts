import { logger } from '@speedy/lib/logger';

import type {
  CallStatusEvent,
  DeliveryEvent,
  InboundMessage,
  SmsProvider,
  WebhookRequest,
} from './provider';

/**
 * Framework-agnostic webhook handling. A Next route is one line:
 *
 *   export const POST = (request: Request) =>
 *     handleWebhook(provider, await fromNextRequest(request), handlers).then(toResponse);
 *
 * Forged or unsigned requests are rejected with 403 before the body is parsed.
 */

/**
 * What a handler may return: a TwiML string (sent as text/xml), a body with its content type, or
 * nothing at all (204). Handlers are typed `unknown` so `async onInbound(m) { await save(m); }`
 * needs no return statement; anything else is treated as nothing.
 */
export type HandlerReply = string | { body: string; contentType?: string } | undefined;

export interface WebhookHandlers {
  onInbound?(message: InboundMessage): unknown;
  onCallStatus?(event: CallStatusEvent): unknown;
  onDelivery?(event: DeliveryEvent): unknown;
}

export interface WebhookResponse {
  status: number;
  body: string;
  contentType: string;
}

const TEXT = 'text/plain; charset=utf-8';
const XML = 'text/xml; charset=utf-8';

const log = logger.child({ pkg: 'sms', where: 'webhook' });

function text(status: number, body: string): WebhookResponse {
  return { status, body, contentType: TEXT };
}

function isBodyReply(reply: unknown): reply is { body: string; contentType?: string } {
  return (
    typeof reply === 'object' &&
    reply !== null &&
    typeof (reply as { body?: unknown }).body === 'string'
  );
}

function fromReply(reply: unknown): WebhookResponse {
  if (typeof reply === 'string') return { status: 200, body: reply, contentType: XML };
  if (isBodyReply(reply))
    return { status: 200, body: reply.body, contentType: reply.contentType ?? XML };
  return { status: 204, body: '', contentType: TEXT };
}

async function dispatch(
  provider: SmsProvider,
  req: WebhookRequest,
  handlers: WebhookHandlers,
): Promise<WebhookResponse> {
  const parsed = provider.parseInbound(req);
  if (!parsed.ok) {
    if (parsed.error.code === 'ignored_event') {
      log.debug('webhook ignored', { why: parsed.error.cause });
      return { status: 204, body: '', contentType: TEXT };
    }
    log.warn('webhook rejected: unparseable', { code: parsed.error.code });
    return text(400, 'Bad Request');
  }
  const event = parsed.value;
  switch (event.kind) {
    case 'inbound':
      return fromReply(await handlers.onInbound?.(event));
    case 'call':
      return fromReply(await handlers.onCallStatus?.(event));
    case 'delivery':
      return fromReply(await handlers.onDelivery?.(event));
  }
}

export async function handleWebhook(
  provider: SmsProvider,
  req: WebhookRequest,
  handlers: WebhookHandlers,
): Promise<WebhookResponse> {
  if (!provider.verifySignature(req)) {
    log.warn('webhook rejected: bad or missing signature', {
      provider: provider.name,
      url: req.url,
    });
    return text(403, 'Forbidden');
  }
  try {
    return await dispatch(provider, req, handlers);
  } catch (e) {
    log.error('webhook handler threw', { error: e });
    return text(500, 'Internal Server Error');
  }
}

export interface FromRequestOptions {
  /**
   * The public origin the provider was given (`https://missed-call.naplesaiagency.com`). Behind
   * Railway's proxy `request.url` is the internal address, so the signature would not match.
   * Defaults to SMS_WEBHOOK_PUBLIC_URL, then APP_URL, then the X-Forwarded-* headers.
   */
  publicUrl?: string | undefined;
}

function publicOrigin(request: Request, options: FromRequestOptions): string | undefined {
  const override = options.publicUrl ?? process.env.SMS_WEBHOOK_PUBLIC_URL ?? process.env.APP_URL;
  if (override) return new URL(override).origin;
  const host = request.headers.get('x-forwarded-host');
  if (!host) return undefined;
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto.split(',')[0]?.trim()}://${host.split(',')[0]?.trim()}`;
}

/** Build the `{ headers, rawBody, url }` shape from a web `Request` (Next's route handler arg). */
export async function fromNextRequest(
  request: Request,
  options: FromRequestOptions = {},
): Promise<WebhookRequest> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const incoming = new URL(request.url);
  const origin = publicOrigin(request, options) ?? incoming.origin;
  return {
    headers,
    rawBody: await request.text(),
    url: `${origin}${incoming.pathname}${incoming.search}`,
  };
}

/** Turn the helper's result into a web `Response`. */
export function toResponse(res: WebhookResponse): Response {
  return new Response(res.status === 204 ? null : res.body, {
    status: res.status,
    headers: { 'content-type': res.contentType },
  });
}
