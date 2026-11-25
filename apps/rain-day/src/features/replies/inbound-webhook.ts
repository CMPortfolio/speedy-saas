import type { Db } from '@speedy/db/core';
import type { SmsProvider } from '@speedy/sms/provider';
import { handleNextWebhook } from '@speedy/sms/webhook';

import { handleInboundText } from './handle-inbound';
import { createReplyStore } from './reply-store';

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
      onInbound: (message) =>
        handleInboundText(
          { provider: deps.provider, store: createReplyStore(deps.getDb()) },
          message,
        ),
    },
    { publicUrl: deps.publicUrl },
  );
}
