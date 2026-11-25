import { fromNextRequest, handleWebhook, toResponse } from '@speedy/sms/webhook';

import { handleReply } from './handle-reply';
import type { VoiceWebhookDeps } from './voice-webhook';

/** POST /api/sms/inbound: Twilio's "a message comes in" webhook. Same rules as the voice one. */
export async function handleInboundSmsWebhook(
  request: Request,
  deps: Pick<VoiceWebhookDeps, 'provider' | 'getStore'>,
): Promise<Response> {
  const req = await fromNextRequest(request);
  const res = await handleWebhook(deps.provider, req, {
    onInbound: (message) =>
      handleReply({ provider: deps.provider, store: deps.getStore() }, message),
  });
  return toResponse(res);
}
