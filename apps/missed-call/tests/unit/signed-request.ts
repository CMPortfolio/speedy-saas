import type { WebhookRequest } from '@speedy/sms/provider';

/** A web Request carrying a WebhookRequest built by the fake provider's `inbound()`. */
export function toRequest(signed: WebhookRequest, headers: Record<string, string> = {}): Request {
  const merged: Record<string, string> = { ...headers };
  for (const [k, v] of Object.entries(signed.headers)) if (v !== undefined) merged[k] = v;
  return new Request(signed.url, { method: 'POST', headers: merged, body: signed.rawBody });
}
