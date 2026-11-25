import { describe, expect, it } from 'vitest';

import { planMessages, type PlanCustomer } from '@/features/rain-day/plan';

function customers(n: number, optedOut: number[] = []): PlanCustomer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: `Customer${i} Last`,
    phone: `+1239555${String(1000 + i)}`,
    opted_out: optedOut.includes(i),
  }));
}

describe('planMessages', () => {
  const template = 'Hi {first_name}, moving you to {new_day}. - Green Gulf Lawn';

  it('makes one message per ticked customer, each with its own name', () => {
    const all = customers(15);
    const plan = planMessages({
      customers: all,
      selectedIds: all.map((c) => c.id),
      template,
      newDay: 'Wednesday',
    });
    expect(plan).toHaveLength(15);
    expect(plan[3]).toMatchObject({
      customer_id: all[3]!.id,
      status: 'queued',
      body: 'Hi Customer3, moving you to Wednesday. - Green Gulf Lawn',
    });
  });

  it('skips opted-out customers and keeps them in the list as skipped', () => {
    const all = customers(15, [4, 9]);
    const plan = planMessages({
      customers: all,
      selectedIds: all.map((c) => c.id),
      template,
      newDay: 'Wednesday',
    });
    expect(plan.filter((m) => m.status === 'skipped').map((m) => m.customer_id)).toEqual([
      all[4]!.id,
      all[9]!.id,
    ]);
    expect(plan.filter((m) => m.status === 'queued')).toHaveLength(13);
  });

  it('leaves out customers the owner unticked and ids that are not theirs', () => {
    const all = customers(5);
    const plan = planMessages({
      customers: all,
      selectedIds: [all[0]!.id, all[2]!.id, '00000000-0000-4000-8000-ffffffffffff'],
      template,
      newDay: 'Monday',
    });
    expect(plan.map((m) => m.customer_id)).toEqual([all[0]!.id, all[2]!.id]);
  });

  it('counts each customer once even when an id repeats', () => {
    const all = customers(2);
    const plan = planMessages({
      customers: all,
      selectedIds: [all[0]!.id, all[0]!.id],
      template,
      newDay: 'Monday',
    });
    expect(plan).toHaveLength(1);
  });

  it('never puts any customer’s phone number in any message', () => {
    const all = customers(15);
    const plan = planMessages({
      customers: all,
      selectedIds: all.map((c) => c.id),
      template,
      newDay: 'Monday',
    });
    for (const message of plan) {
      for (const c of all) {
        expect(message.body).not.toContain(c.phone);
        expect(message.body).not.toContain(c.phone.slice(2));
      }
    }
  });
});
