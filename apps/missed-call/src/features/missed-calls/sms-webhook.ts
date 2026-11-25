import { handleNextWebhook } from '@speedy/sms/webhook';

import { handleReply } from './handle-reply';
import type { VoiceWebhookDeps } from './voice-webhook';

/** POST /api/sms/inbound: Twilio's "a message comes in" webhook. Same rules as the voice one. */
export function handleInboundSmsWebhook(
  request: Request,
  deps: Pick<VoiceWebhookDeps, 'provider' | 'getStore'>,
): Promise<Response> {
  return handleNextWebhook(deps.provider, request, {
    onInbound: (message) =>
      handleReply({ provider: deps.provider, store: deps.getStore() }, message),
  });
}
