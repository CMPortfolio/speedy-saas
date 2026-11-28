import type { SmsProvider } from '@speedy/sms/provider';
import { twimlSay } from '@speedy/sms/twilio';
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
  /** Next's `after()`: keeps a late text send alive after the response. */
  defer?: (task: Promise<unknown>) => void;
}

/** POST /api/voice/incoming: Twilio's "a call comes in" and "call status changes" webhook. */
export async function handleVoiceWebhook(
  request: Request,
  deps: VoiceWebhookDeps,
): Promise<Response> {
  const res = await handleNextWebhook(deps.provider, request, {
    onCallStatus: (event) =>
      handleMissedCall(
        {
          provider: deps.provider,
          store: deps.getStore(),
          ...(deps.now ? { now: deps.now } : {}),
          ...(deps.sendTimeoutMs ? { sendTimeoutMs: deps.sendTimeoutMs } : {}),
          ...(deps.defer ? { defer: deps.defer } : {}),
        },
        event,
      ),
  });
  // A call must always be answered with TwiML: an empty 204 (a hidden or non-US caller id, or a
  // status callback we do not act on) would play Twilio's "application error" to the caller.
  if (res.status === 204) {
    return new Response(twimlSay('Sorry we missed you. Please try again soon.'), {
      status: 200,
      headers: { 'content-type': 'text/xml; charset=utf-8' },
    });
  }
  return res;
}
