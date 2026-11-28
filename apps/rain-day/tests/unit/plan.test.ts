import { describe, expect, it } from 'vitest';

import { hasOverlongBody, planMessages, type PlanCustomer } from '@/features/rain-day/plan';

function customers(n: number): PlanCustomer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: `Customer${i} Last`,
    phone: `+1239555${String(1000 + i)}`,
  }));
}

const template = 'Hi {first_name}, moving you to {new_day}. - Green Gulf Lawn';
const none = new Set<string>();

describe('planMessages', () => {
  it('makes one message per ticked customer, each with its own name', () => {
    const all = customers(15);
    const plan = planMessages({
      customers: all,
      selectedIds: all.map((c) => c.id),
      optedOutPhones: none,
      template,
      newDay: 'Wednesday',
    });
    expect(plan).toHaveLength(15);
    expect(plan[3]).toMatchObject({
      customer_id: all[3]!.id,
      status: 'queued',
      error_code: null,
      body: 'Hi Customer3, moving you to Wednesday. - Green Gulf Lawn',
    });
  });

  it('skips opted-out customers and keeps them in the list as skipped with the reason', () => {
    const all = customers(15);
    const plan = planMessages({
      customers: all,
      selectedIds: all.map((c) => c.id),
      optedOutPhones: new Set([all[4]!.phone, all[9]!.phone]),
      template,
      newDay: 'Wednesday',
    });
    const skipped = plan.filter((m) => m.status === 'skipped');
    expect(skipped.map((m) => m.customer_id)).toEqual([all[4]!.id, all[9]!.id]);
    expect(skipped.every((m) => m.error_code === 'opted_out')).toBe(true);
    expect(plan.filter((m) => m.status === 'queued')).toHaveLength(13);
  });

  it('skips numbers outside the US as non_us, even if they were saved earlier', () => {
    const all = customers(3);
    // 416 is Toronto: a valid North American number, but billed as international.
    const withCanada = [
      ...all,
      { id: '00000000-0000-4000-8000-0000000000ff', name: 'Eh Canada', phone: '+14165550123' },
    ];
    const plan = planMessages({
      customers: withCanada,
      selectedIds: withCanada.map((c) => c.id),
      optedOutPhones: none,
      template,
      newDay: 'Monday',
    });
    expect(plan[3]).toMatchObject({ status: 'skipped', error_code: 'non_us' });
    expect(plan.filter((m) => m.status === 'queued')).toHaveLength(3);
  });

  it('leaves out customers the owner unticked and ids that are not theirs', () => {
    const all = customers(5);
    const plan = planMessages({
      customers: all,
      selectedIds: [all[0]!.id, all[2]!.id, '00000000-0000-4000-8000-ffffffffffff'],
      optedOutPhones: none,
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
      optedOutPhones: none,
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
      optedOutPhones: none,
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

  it('flags a text that is too long once names are filled in', () => {
    const longName = [
      { id: '00000000-0000-4000-8000-000000000001', name: 'N'.repeat(100), phone: '+12395551001' },
    ];
    const plan = planMessages({
      customers: longName,
      selectedIds: [longName[0]!.id],
      optedOutPhones: none,
      template: '{first_name} '.repeat(30),
      newDay: 'Monday',
    });
    expect(hasOverlongBody(plan)).toBe(true);
    expect(
      hasOverlongBody(
        planMessages({
          customers: longName,
          selectedIds: [longName[0]!.id],
          optedOutPhones: none,
          template,
          newDay: 'Monday',
        }),
      ),
    ).toBe(false);
  });
});
