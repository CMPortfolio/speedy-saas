import type { Database } from '@speedy/db/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  clearPractice,
  replyPractice,
  sendPractice,
  type PracticeContext,
  type PracticeSendInput,
} from '@/features/practice/core';
import { PRACTICE_REFUSED } from '@/features/practice/gate';
import { listPracticeMessages, listPracticeOptedOutIds } from '@/features/practice/queries';
import type { SendInput } from '@/features/rain-day/schema';

/**
 * Practice mode against the local Supabase stack: it writes only practice rows, is refused for an
 * owner with a real number, is rate-limited and capped, and never touches a real table. Needs
 * DB_TESTS=1 and the three Supabase env vars.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(process.env.DB_TESTS && url && anon && serviceKey);

type Client = SupabaseClient<Database>;
interface Owner {
  id: string;
  client: Client;
}
let service: Client;
const created: string[] = [];

async function signedIn(): Promise<Owner> {
  const email = `${crypto.randomUUID()}@resend.dev`;
  const password = `pw-${crypto.randomUUID()}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw made.error;
  created.push(made.data.user.id);
  const client = createClient<Database>(url!, anon!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: made.data.user.id, client };
}

async function ownerWith(count: number) {
  const owner = await signedIn();
  // Distinct, valid US numbers (exchange 800 is never reserved); unique per owner is enough.
  const rows = Array.from({ length: count }, (_, i) => ({
    owner_id: owner.id,
    name: `Customer${i} Test`,
    phone: `+12398${String(i).padStart(6, '0')}`,
    service_day: 2,
  }));
  const { error } = await service.schema('rain_day').from('customers').insert(rows);
  if (error) throw error;
  const { data } = await owner.client
    .schema('rain_day')
    .from('customers')
    .select('*')
    .order('name');
  return { owner, customers: data! };
}

const request = (customers: { id: string }[], key = crypto.randomUUID()): SendInput => ({
  idempotencyKey: key,
  from: '2026-12-01',
  to: '2026-12-02',
  template: 'Hi {first_name}, moving you to {new_day}. — Green Gulf Lawn',
  customerIds: customers.map((c) => c.id),
});

const sendInput = (
  customers: PracticeSendInput['customers'],
  extra: Partial<PracticeSendInput> = {},
): PracticeSendInput => ({
  customers,
  realOptedOutPhones: new Set(),
  practiceOptedOutIds: new Set(),
  today: '2026-11-24',
  ...extra,
});

async function ctxFor(owner: Owner, providerName = 'twilio'): Promise<PracticeContext> {
  const { data } = await owner.client
    .schema('rain_day')
    .from('owner_settings')
    .select('*')
    .maybeSingle();
  return { service, ownerId: owner.id, settings: data, providerName };
}

async function realCounts(ownerId: string) {
  const count = async (table: 'reschedules' | 'replies' | 'opt_outs') =>
    (
      await service
        .schema('rain_day')
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
    ).count;
  const messages = await service
    .schema('rain_day')
    .from('reschedule_messages')
    .select('id, reschedules!inner(owner_id)', { count: 'exact', head: true })
    .eq('reschedules.owner_id', ownerId);
  return {
    reschedules: await count('reschedules'),
    messages: messages.count,
    replies: await count('replies'),
    optOuts: await count('opt_outs'),
  };
}

beforeAll(() => {
  if (enabled)
    service = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
});

afterAll(async () => {
  if (enabled) for (const id of created) await service.auth.admin.deleteUser(id);
});

describe.skipIf(!enabled)('practice send', { timeout: 60_000 }, () => {
  it('sends 15 customers to the practice phone, skips the opted-out, and writes no real row', async () => {
    const { owner, customers } = await ownerWith(15);
    const ctx = await ctxFor(owner);
    const result = await sendPractice(
      ctx,
      sendInput(customers, {
        realOptedOutPhones: new Set([
          customers.find((c) => c.name === 'Customer3 Test')!.phone,
          customers.find((c) => c.name === 'Customer11 Test')!.phone,
        ]),
      }),
      request(customers),
    );
    expect(result).toMatchObject({ ok: true, alreadySent: false });
    if (!result.ok) return;
    const rows = await listPracticeMessages(owner.client, result.rescheduleId);
    expect(rows).toHaveLength(15);
    expect(rows.every((r) => r.direction === 'out' && r.kind === 'text')).toBe(true);
    expect(rows.filter((r) => r.status === 'sent')).toHaveLength(13);
    const skipped = rows.filter((r) => r.status === 'skipped');
    expect(skipped.map((r) => r.customer_name).sort()).toEqual([
      'Customer11 Test',
      'Customer3 Test',
    ]);
    expect(skipped.every((r) => r.error_code === 'opted_out')).toBe(true);
    // One bubble per customer, each with their own name and nobody's number.
    expect(new Set(rows.map((r) => r.customer_id)).size).toBe(15);
    expect(rows.find((r) => r.customer_name === 'Customer0 Test')!.body).toMatch(/^Hi Customer0, /);
    for (const r of rows) for (const c of customers) expect(r.body).not.toContain(c.phone.slice(2));
    expect(await realCounts(owner.id)).toEqual({
      reschedules: 0,
      messages: 0,
      replies: 0,
      optOuts: 0,
    });
  });

  it('a double tap makes one practice rain day', async () => {
    const { owner, customers } = await ownerWith(3);
    const ctx = await ctxFor(owner);
    const key = crypto.randomUUID();
    const first = await sendPractice(ctx, sendInput(customers), request(customers, key));
    const second = await sendPractice(ctx, sendInput(customers), request(customers, key));
    expect(first).toMatchObject({ ok: true, alreadySent: false });
    expect(second).toMatchObject({ ok: true, alreadySent: true });
    const { count } = await owner.client
      .schema('rain_day')
      .from('practice_messages')
      .select('id', { count: 'exact', head: true });
    expect(count).toBe(3);
  });

  it('is refused once the owner has a real number and Messaging Service, and writes nothing', async () => {
    const { owner, customers } = await ownerWith(2);
    await service
      .schema('rain_day')
      .from('owner_settings')
      .upsert(
        {
          owner_id: owner.id,
          sender_number: `+12397${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`,
          sender_messaging_service_sid: `MG${crypto.randomUUID().replaceAll('-', '')}`,
        },
        { onConflict: 'owner_id' },
      );
    const ctx = await ctxFor(owner);
    const refused = await sendPractice(ctx, sendInput(customers), request(customers));
    expect(refused).toEqual({ ok: false, message: PRACTICE_REFUSED });
    const reply = await replyPractice(ctx, {
      rescheduleId: crypto.randomUUID(),
      customer: customers[0]!,
      body: 'hi',
      businessName: 'Green Gulf Lawn',
    });
    expect(reply).toEqual({ ok: false, message: PRACTICE_REFUSED });
    const { count } = await owner.client
      .schema('rain_day')
      .from('practice_reschedules')
      .select('id', { count: 'exact', head: true });
    expect(count).toBe(0);
  });

  it('a number without a Messaging Service is still practice with the real provider, but not with the fake one', async () => {
    const { owner, customers } = await ownerWith(1);
    await service
      .schema('rain_day')
      .from('owner_settings')
      .upsert(
        {
          owner_id: owner.id,
          sender_number: `+12397${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`,
        },
        { onConflict: 'owner_id' },
      );
    expect(
      (await sendPractice(await ctxFor(owner, 'twilio'), sendInput(customers), request(customers)))
        .ok,
    ).toBe(true);
    expect(
      await sendPractice(await ctxFor(owner, 'fake'), sendInput(customers), request(customers)),
    ).toEqual({
      ok: false,
      message: PRACTICE_REFUSED,
    });
  });
});

describe.skipIf(!enabled)('practice limits', { timeout: 60_000 }, () => {
  it('stops at 60 practice actions an hour per owner, and the limit is per owner', async () => {
    const { owner, customers } = await ownerWith(1);
    const other = await ownerWith(1);
    const ctx = await ctxFor(owner);
    for (let i = 0; i < 60; i++) {
      expect((await sendPractice(ctx, sendInput(customers), request(customers))).ok).toBe(true);
    }
    const over = await sendPractice(ctx, sendInput(customers), request(customers));
    expect(over.ok).toBe(false);
    expect(!over.ok && over.message).toMatch(/going quickly/i);
    expect(
      (
        await sendPractice(
          await ctxFor(other.owner),
          sendInput(other.customers),
          request(other.customers),
        )
      ).ok,
    ).toBe(true);
  }, 120_000);

  it('holds at most 2,000 bubbles; clearing makes room again', async () => {
    const { owner, customers } = await ownerWith(500);
    const ctx = await ctxFor(owner);
    for (let i = 0; i < 4; i++) {
      expect((await sendPractice(ctx, sendInput(customers), request(customers))).ok).toBe(true);
    }
    const full = await sendPractice(
      ctx,
      sendInput(customers.slice(0, 1)),
      request(customers.slice(0, 1)),
    );
    expect(full.ok).toBe(false);
    expect(!full.ok && full.message).toMatch(/full/i);
    const cleared = await clearPractice(ctx);
    expect(cleared).toMatchObject({ ok: true, removed: 2000 });
    expect(
      (await sendPractice(ctx, sendInput(customers.slice(0, 1)), request(customers.slice(0, 1))))
        .ok,
    ).toBe(true);
  }, 180_000);
});

describe.skipIf(!enabled)('practice replies', { timeout: 60_000 }, () => {
  async function started() {
    const { owner, customers } = await ownerWith(3);
    const ctx = await ctxFor(owner);
    const sent = await sendPractice(ctx, sendInput(customers), request(customers));
    if (!sent.ok) throw new Error(sent.message);
    const reply = (index: number, body: string) =>
      replyPractice(ctx, {
        rescheduleId: sent.rescheduleId,
        customer: customers[index]!,
        body,
        businessName: 'Green Gulf Lawn',
      });
    const bubbles = () => listPracticeMessages(owner.client, sent.rescheduleId);
    return { owner, customers, ctx, sent, reply, bubbles };
  }

  it('a reply shows as the customer’s bubble and as a forward to the owner’s cell, and touches no real row', async () => {
    const { owner, customers, reply, bubbles } = await started();
    expect(await reply(0, 'Can you do Thursday?')).toMatchObject({ ok: true, forwarded: true });
    const rows = (await bubbles()).filter((r) => r.customer_id === customers[0]!.id);
    expect(rows.map((r) => [r.direction, r.kind, r.status])).toEqual([
      ['out', 'text', 'replied'],
      ['in', 'text', 'received'],
      ['forward', 'text', 'sent'],
    ]);
    expect(rows.find((r) => r.direction === 'forward')!.body).toContain(
      'Customer0 Test replied: "Can you do Thursday?"',
    );
    expect(await realCounts(owner.id)).toEqual({
      reschedules: 0,
      messages: 0,
      replies: 0,
      optOuts: 0,
    });
  });

  it('STOP skips that customer on the next practice send; START brings them back; the real STOP list is untouched', async () => {
    const { owner, customers, ctx, reply } = await started();
    expect(await reply(1, 'STOP')).toMatchObject({ ok: true, forwarded: false });
    const stopped = await listPracticeOptedOutIds(owner.client);
    expect([...stopped]).toEqual([customers[1]!.id]);
    expect(await realCounts(owner.id)).toMatchObject({ optOuts: 0 });

    const next = await sendPractice(
      ctx,
      sendInput(customers, { practiceOptedOutIds: stopped }),
      request(customers),
    );
    if (!next.ok) throw new Error(next.message);
    const rows = await listPracticeMessages(owner.client, next.rescheduleId);
    expect(rows.find((r) => r.customer_id === customers[1]!.id)).toMatchObject({
      status: 'skipped',
      error_code: 'opted_out',
    });
    expect(rows.filter((r) => r.status === 'sent')).toHaveLength(2);

    expect(
      await replyPractice(ctx, {
        rescheduleId: next.rescheduleId,
        customer: customers[1]!,
        body: 'START',
        businessName: 'Green Gulf Lawn',
      }),
    ).toMatchObject({ ok: true });
    expect((await listPracticeOptedOutIds(owner.client)).size).toBe(0);
  });
});

describe.skipIf(!enabled)('practice HELP, clear and isolation', { timeout: 60_000 }, () => {
  async function started() {
    const { owner, customers } = await ownerWith(3);
    const ctx = await ctxFor(owner);
    const sent = await sendPractice(ctx, sendInput(customers), request(customers));
    if (!sent.ok) throw new Error(sent.message);
    const reply = (index: number, body: string) =>
      replyPractice(ctx, {
        rescheduleId: sent.rescheduleId,
        customer: customers[index]!,
        body,
        businessName: 'Green Gulf Lawn',
      });
    const bubbles = () => listPracticeMessages(owner.client, sent.rescheduleId);
    return { owner, customers, ctx, sent, reply, bubbles };
  }

  it('HELP is answered once with the business name, a plain Yes is forwarded, and no customer outside the rain day can reply', async () => {
    const { customers, reply, bubbles, ctx, sent } = await started();
    await reply(2, 'HELP');
    await reply(2, 'help');
    await reply(0, 'Yes');
    const rows = await bubbles();
    const helps = rows.filter((r) => r.kind === 'help');
    expect(helps).toHaveLength(1);
    expect(helps[0]!.body).toBe(
      'Green Gulf Lawn: reply STOP to opt out. Msg & data rates may apply.',
    );
    expect(rows.filter((r) => r.direction === 'forward').map((r) => r.body)).toEqual([
      expect.stringContaining('"Yes"'),
    ]);

    const stranger = await ownerWith(1);
    const refused = await replyPractice(ctx, {
      rescheduleId: sent.rescheduleId,
      customer: stranger.customers[0]!,
      body: 'hi',
      businessName: 'x',
    });
    expect(refused.ok).toBe(false);
    expect(customers).toHaveLength(3);
  });

  it('clear practice removes only practice rows: a real rain day stays', async () => {
    const { owner, ctx, customers, reply, bubbles } = await started();
    await reply(0, 'hello');
    const real = await service.schema('rain_day').from('reschedules').insert({
      owner_id: owner.id,
      from_date: '2026-12-01',
      to_date: '2026-12-02',
      template: 'real',
      idempotency_key: crypto.randomUUID(),
    });
    expect(real.error).toBeNull();
    await service
      .schema('rain_day')
      .from('opt_outs')
      .insert({ owner_id: owner.id, phone: customers[2]!.phone });
    const cleared = await clearPractice(ctx);
    expect(cleared).toMatchObject({ ok: true });
    expect(await bubbles()).toEqual([]);
    expect(await realCounts(owner.id)).toMatchObject({ reschedules: 1, optOuts: 1 });
  });

  it('owner A cannot see owner B’s practice phone', async () => {
    const [a, b] = [await started(), await started()];
    const mine = await a.owner.client
      .schema('rain_day')
      .from('practice_messages')
      .select('owner_id');
    expect(mine.data!.every((r) => r.owner_id === a.owner.id)).toBe(true);
    const theirs = await a.owner.client
      .schema('rain_day')
      .from('practice_messages')
      .select('id')
      .eq('practice_reschedule_id', b.sent.rescheduleId);
    expect(theirs.data).toEqual([]);
  });
});
