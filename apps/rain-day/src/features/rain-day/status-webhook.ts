import type { Db } from '@speedy/db/core';
import type { SmsProvider } from '@speedy/sms/provider';
import { fromNextRequest, handleWebhook, toResponse } from '@speedy/sms/webhook';

import { applyDeliveryEvent } from './delivery-store';

/**
 * The delivery-status webhook. `handleWebhook` checks the provider's signature first and answers
 * 403 without running anything below it, so `getDb` (the service-role client) is not even
 * created for a forged request.
 */
export async function handleStatusWebhook(
  request: Request,
  deps: { provider: SmsProvider; getDb: () => Db },
): Promise<Response> {
  const res = await handleWebhook(deps.provider, await fromNextRequest(request), {
    onDelivery: (event) => applyDeliveryEvent(deps.getDb(), event),
  });
  return toResponse(res);
}
