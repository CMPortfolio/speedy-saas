import type { SmsProvider } from '@speedy/sms/provider';
import { handleNextWebhook } from '@speedy/sms/webhook';

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
export function handleVoiceWebhook(request: Request, deps: VoiceWebhookDeps): Promise<Response> {
  return handleNextWebhook(deps.provider, request, {
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
}
