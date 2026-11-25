import type { Db } from '@speedy/db/core';
import type { SmsProvider } from '@speedy/sms/provider';
import { fromNextRequest, handleWebhook, toResponse } from '@speedy/sms/webhook';

import { handleInboundText } from './handle-inbound';
import { createReplyStore } from './reply-store';

/**
 * Texts customers send to the business number. The signature is checked first, so a forged
 * request is answered 403 and `getDb` (the service-role client) is never even created.
 */
export async function handleInboundWebhook(
  request: Request,
  deps: { provider: SmsProvider; getDb: () => Db },
): Promise<Response> {
  const res = await handleWebhook(deps.provider, await fromNextRequest(request), {
    onInbound: (message) =>
      handleInboundText(
        { provider: deps.provider, store: createReplyStore(deps.getDb()) },
        message,
      ),
  });
  return toResponse(res);
}
