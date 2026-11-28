import { isUsDomesticPhone } from '@speedy/lib/phone';

import { renderMessage } from './template';

export interface PlanCustomer {
  id: string;
  name: string;
  phone: string;
}

/** Why a customer is in the plan but will not be texted. */
export type SkipReason = 'opted_out' | 'non_us';

/** A type alias (not an interface) so it is assignable to Json for the RPC call. */
export type PlannedMessage = {
  customer_id: string;
  customer_name: string;
  body: string;
  status: 'queued' | 'skipped';
  error_code: SkipReason | null;
};

/** The longest text create_reschedule accepts, after names and the day are filled in. */
export const MAX_BODY_LENGTH = 480;

export function skipReason(
  customer: PlanCustomer,
  optedOutPhones: ReadonlySet<string>,
): SkipReason | null {
  if (optedOutPhones.has(customer.phone)) return 'opted_out';
  if (!isUsDomesticPhone(customer.phone)) return 'non_us';
  return null;
}

/**
 * One message per ticked customer, each filled in on its own. Ids that are not in `customers`
 * (the owner's own list, read through RLS) are dropped, so a tampered request cannot reach
 * anyone else. Opted-out and non-US customers stay in the plan as `skipped` (with the reason) so
 * the owner sees them. The body never includes any phone number.
 */
export function planMessages(input: {
  customers: readonly PlanCustomer[];
  selectedIds: readonly string[];
  optedOutPhones: ReadonlySet<string>;
  template: string;
  newDay: string;
}): PlannedMessage[] {
  const selected = new Set(input.selectedIds);
  return input.customers
    .filter((c) => selected.has(c.id))
    .map((c) => {
      const reason = skipReason(c, input.optedOutPhones);
      return {
        customer_id: c.id,
        customer_name: c.name,
        body: renderMessage(input.template, { name: c.name, newDay: input.newDay }),
        status: reason ? ('skipped' as const) : ('queued' as const),
        error_code: reason,
      };
    });
}

/** True when some text to be sent is too long once names are filled in. */
export function hasOverlongBody(plan: readonly PlannedMessage[]): boolean {
  return plan.some((m) => m.status === 'queued' && m.body.length > MAX_BODY_LENGTH);
}
