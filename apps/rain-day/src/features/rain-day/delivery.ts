import type { DeliveryStatus } from '@speedy/sms/provider';

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'replied' | 'skipped';

/** Provider status to our status. `queued` carries no news; nothing to write. */
export function mapDeliveryStatus(status: DeliveryStatus): MessageStatus | null {
  switch (status) {
    case 'queued':
      return null;
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'failed':
    case 'undelivered':
      return 'failed';
  }
}

/**
 * Statuses a message may be in for the new one to apply. Providers send events out of order and
 * more than once; this keeps a late "sent" from undoing "delivered" and never touches "replied".
 */
export function allowedPreviousStatuses(next: MessageStatus): MessageStatus[] {
  switch (next) {
    case 'sent':
      return ['queued'];
    case 'delivered':
    case 'failed':
      return ['queued', 'sent'];
    default:
      return [];
  }
}
