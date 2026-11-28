import type { Db } from '@speedy/db/core';
import type { SmsProvider } from '@speedy/sms/provider';
import { handleNextWebhook } from '@speedy/sms/webhook';

import { applyDeliveryEvent } from './delivery-store';

/**
 * The delivery-status webhook. The provider's signature is checked first and a forged request is
 * answered 403 without running anything below it, so `getDb` (the service-role client) is not
 * even created. `publicUrl` is the origin the provider signed (SMS_WEBHOOK_PUBLIC_URL or
 * APP_URL); in production with none the request is refused with 500 rather than trust headers.
 */
export function handleStatusWebhook(
  request: Request,
  deps: { provider: SmsProvider; getDb: () => Db; publicUrl?: string | undefined },
): Promise<Response> {
  return handleNextWebhook(
    deps.provider,
    request,
    { onDelivery: (event) => applyDeliveryEvent(deps.getDb(), event, deps.provider.name) },
    { publicUrl: deps.publicUrl },
  );
}
