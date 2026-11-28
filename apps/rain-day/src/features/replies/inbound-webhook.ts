import type { Db } from '@speedy/db/core';
import type { SmsProvider } from '@speedy/sms/provider';
import { handleNextWebhook } from '@speedy/sms/webhook';

import { handleInboundText } from './handle-inbound';
import { createInboundStore } from './reply-store';

/** Tells Twilio there is nothing to say back (the reply to the customer, if any, goes by API). */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

/**
 * Texts customers send to the business number. The signature is checked first, so a forged
 * request is answered 403 and `getDb` (the service-role client) is never even created.
 * `publicUrl` is the origin the provider signed (SMS_WEBHOOK_PUBLIC_URL or APP_URL); in
 * production with none the request is refused with 500 rather than trust headers.
 */
export function handleInboundWebhook(
  request: Request,
  deps: { provider: SmsProvider; getDb: () => Db; publicUrl?: string | undefined },
): Promise<Response> {
  return handleNextWebhook(
    deps.provider,
    request,
    {
      onInbound: async (message) => {
        await handleInboundText(
          { provider: deps.provider, store: createInboundStore(deps.getDb()) },
          message,
        );
        return EMPTY_TWIML;
      },
    },
    { publicUrl: deps.publicUrl },
  );
}
