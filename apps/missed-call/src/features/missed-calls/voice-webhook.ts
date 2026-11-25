import type { SmsProvider } from '@speedy/sms/provider';
import { fromNextRequest, handleWebhook, toResponse } from '@speedy/sms/webhook';

import { handleMissedCall } from './handle-missed-call';
import type { MissedCallStore } from './store';

export interface VoiceWebhookDeps {
  provider: SmsProvider;
  /**
   * Builds the store (and with it the service-role client). Called only after the provider
   * signature has been verified, so a forged request never reaches the database or even needs
   * the service key to be configured.
   */
  getStore: () => MissedCallStore;
  now?: () => Date;
  sendTimeoutMs?: number;
}

/** POST /api/voice/incoming: Twilio's "a call comes in" and "call status changes" webhook. */
export async function handleVoiceWebhook(
  request: Request,
  deps: VoiceWebhookDeps,
): Promise<Response> {
  const req = await fromNextRequest(request);
  const res = await handleWebhook(deps.provider, req, {
    onCallStatus: (event) =>
      handleMissedCall(
        {
          provider: deps.provider,
          store: deps.getStore(),
          ...(deps.now ? { now: deps.now } : {}),
          ...(deps.sendTimeoutMs ? { sendTimeoutMs: deps.sendTimeoutMs } : {}),
        },
        event,
      ),
  });
  return toResponse(res);
}
