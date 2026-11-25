import { renderMessage } from './template';

export interface PlanCustomer {
  id: string;
  name: string;
  phone: string;
  opted_out: boolean;
}

export interface PlannedMessage {
  customer_id: string;
  customer_name: string;
  body: string;
  status: 'queued' | 'skipped';
}

/**
 * One message per ticked customer, each filled in on its own. Ids that are not in `customers`
 * (the owner's own list, read through RLS) are dropped, so a tampered request cannot reach
 * anyone else. Opted-out customers stay in the plan as `skipped` so the owner sees them.
 * The body never includes any phone number.
 */
export function planMessages(input: {
  customers: readonly PlanCustomer[];
  selectedIds: readonly string[];
  template: string;
  newDay: string;
}): PlannedMessage[] {
  const selected = new Set(input.selectedIds);
  return input.customers
    .filter((c) => selected.has(c.id))
    .map((c) => ({
      customer_id: c.id,
      customer_name: c.name,
      body: renderMessage(input.template, { name: c.name, newDay: input.newDay }),
      status: c.opted_out ? ('skipped' as const) : ('queued' as const),
    }));
}
