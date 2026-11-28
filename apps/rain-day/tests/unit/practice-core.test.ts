import type { Database } from '@speedy/db/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  clearPractice,
  expirePractice,
  replyPractice,
  sendPractice,
  type PracticeContext,
  type PracticeSendInput,
} from '@/features/practice/core';
import { PRACTICE_REFUSED } from '@/features/practice/gate';
import { listPracticeMessages, listPracticeOptedOutIds } from '@/features/practice/queries';
import type { SendInput } from '@/features/rain-day/schema';

/**
 * Practice mode against the local Supabase stack: it writes only practice rows (customer ids, no
 * copy of a name or number), is refused for an owner with a texting number, is rate-limited and
 * capped, rejects another owner's ids, and never touches a real table. Needs DB_TESTS=1 and the
 * three Supabase env vars.
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
  contactedIds: new Set(),
  businessName: 'Green Gulf Lawn',
  today: '2026-11-24',
  ...extra,
});

async function ctxFor(owner: Owner): Promise<PracticeContext> {
  const { data } = await owner.client
    .schema('rain_day')
    .from('owner_settings')
    .select('*')
    .maybeSingle();
  return { service, ownerId: owner.id, settings: data };
}

async function setNumber(ownerId: string, withService: boolean) {
  const { error } = await service
    .schema('rain_day')
    .from('owner_settings')
    .upsert(
      {
        owner_id: ownerId,
        sender_number: `+12397${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`,
        ...(withService
          ? { sender_messaging_service_sid: `MG${crypto.randomUUID().replaceAll('-', '')}` }
          : {}),
      },
      { onConflict: 'owner_id' },
    );
  if (error) throw error;
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
    const named = (n: string) => customers.find((c) => c.name === n)!;
    const result = await sendPractice(
      ctx,
      sendInput(customers, {
        realOptedOutPhones: new Set([
          named('Customer3 Test').phone,
          named('Customer11 Test').phone,
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
    expect(skipped.map((r) => r.customers?.name).sort()).toEqual([
      'Customer11 Test',
      'Customer3 Test',
    ]);
    expect(skipped.every((r) => r.error_code === 'opted_out')).toBe(true);
    // One bubble per customer, each with their own name and nobody's number.
    expect(new Set(rows.map((r) => r.customer_id)).size).toBe(15);
    const zero = rows.find((r) => r.customers?.name === 'Customer0 Test')!;
    expect(zero.body).toMatch(/^Hi Customer0, /);
    for (const r of rows) for (const c of customers) expect(r.body).not.toContain(c.phone.slice(2));
    expect(await realCounts(owner.id)).toEqual({
      reschedules: 0,
      messages: 0,
      replies: 0,
      optOuts: 0,
    });
  });

  it('stores the customer by id only: no name or number column on a practice row', async () => {
    const { owner, customers } = await ownerWith(2);
    const sent = await sendPractice(await ctxFor(owner), sendInput(customers), request(customers));
    if (!sent.ok) throw new Error(sent.message);
    const { data } = await service
      .schema('rain_day')
      .from('practice_messages')
      .select('*')
      .eq('owner_id', owner.id);
    for (const row of data!) {
      expect(Object.keys(row)).not.toContain('customer_name');
      expect(Object.keys(row)).not.toContain('phone');
      expect(Object.keys(row)).toContain('customer_id');
    }
  });

  it('shows the opt-out line to a customer who never had a text, and not to one who did', async () => {
    const { owner, customers } = await ownerWith(2);
    const [first, second] = [customers[0]!, customers[1]!];
    const sent = await sendPractice(
      await ctxFor(owner),
      sendInput(customers, { contactedIds: new Set([second.id]) }),
      request(customers),
    );
    if (!sent.ok) throw new Error(sent.message);
    const rows = await listPracticeMessages(owner.client, sent.rescheduleId);
    expect(rows.find((r) => r.customer_id === first.id)!.body).toContain('Reply STOP to opt out');
    expect(rows.find((r) => r.customer_id === second.id)!.body).not.toContain('Reply STOP');
  });
});

describe.skipIf(!enabled)(
  'practice send: idempotency, mode and ownership',
  { timeout: 60_000 },
  () => {
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

    it('is refused once the owner has any texting number, even before the Messaging Service, and writes nothing', async () => {
      for (const withService of [true, false]) {
        const { owner, customers } = await ownerWith(2);
        await setNumber(owner.id, withService);
        const ctx = await ctxFor(owner);
        expect(await sendPractice(ctx, sendInput(customers), request(customers))).toEqual({
          ok: false,
          message: PRACTICE_REFUSED,
        });
        expect(
          await replyPractice(ctx, {
            rescheduleId: crypto.randomUUID(),
            customerId: customers[0]!.id,
            body: 'hi',
            businessName: 'Green Gulf Lawn',
          }),
        ).toEqual({ ok: false, message: PRACTICE_REFUSED });
        const { count } = await owner.client
          .schema('rain_day')
          .from('practice_reschedules')
          .select('id', { count: 'exact', head: true });
        expect(count).toBe(0);
      }
    });

    it('only the owner’s own customers can be reached: another owner’s ids are dropped', async () => {
      const mine = await ownerWith(2);
      const theirs = await ownerWith(2);
      const ctx = await ctxFor(mine.owner);
      // The browser sends the other owner's customer ids along with its own.
      const mixed = [...mine.customers, ...theirs.customers];
      const sent = await sendPractice(ctx, sendInput(mine.customers), request(mixed));
      if (!sent.ok) throw new Error(sent.message);
      const rows = await listPracticeMessages(mine.owner.client, sent.rescheduleId);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => mine.customers.some((c) => c.id === r.customer_id))).toBe(true);
      const { count } = await service
        .schema('rain_day')
        .from('practice_messages')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', theirs.owner.id);
      expect(count).toBe(0);
      // And a request naming only the other owner's customers sends nothing.
      const none = await sendPractice(ctx, sendInput(mine.customers), request(theirs.customers));
      expect(none).toEqual({ ok: false, message: 'Tick at least one customer.' });
    });
  },
);

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

  it('holds at most 1,000 bubbles; clearing makes room again', async () => {
    const { owner, customers } = await ownerWith(500);
    const ctx = await ctxFor(owner);
    for (let i = 0; i < 2; i++) {
      expect((await sendPractice(ctx, sendInput(customers), request(customers))).ok).toBe(true);
    }
    const one = customers.slice(0, 1);
    const full = await sendPractice(ctx, sendInput(one), request(one));
    expect(full.ok).toBe(false);
    expect(!full.ok && full.message).toMatch(/full/i);
    expect(await clearPractice(ctx)).toMatchObject({ ok: true, removed: 1000 });
    expect((await sendPractice(ctx, sendInput(one), request(one))).ok).toBe(true);
  }, 180_000);

  it('practice rows older than a week expire, newer ones stay', async () => {
    const { owner, customers } = await ownerWith(2);
    const ctx = await ctxFor(owner);
    const old = await sendPractice(ctx, sendInput(customers), request(customers));
    const fresh = await sendPractice(ctx, sendInput(customers), request(customers));
    if (!old.ok || !fresh.ok) throw new Error('send failed');
    await service
      .schema('rain_day')
      .from('practice_reschedules')
      .update({ created_at: new Date(Date.now() - 8 * 86_400_000).toISOString() })
      .eq('id', old.rescheduleId);
    await expirePractice(ctx);
    expect(await listPracticeMessages(owner.client, old.rescheduleId)).toEqual([]);
    expect(await listPracticeMessages(owner.client, fresh.rescheduleId)).toHaveLength(2);
  });
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
        customerId: customers[index]!.id,
        body,
        businessName: 'Green Gulf Lawn',
      });
    const bubbles = () => listPracticeMessages(owner.client, sent.rescheduleId);
    return { owner, customers, ctx, sent, reply, bubbles };
  }

  it('a reply shows as the customer’s bubble and a forward to the owner’s cell, and touches no real row', async () => {
    const { owner, customers, reply, bubbles } = await started();
    expect(await reply(0, 'Can you do Thursday?')).toMatchObject({ ok: true, forwarded: true });
    const rows = (await bubbles()).filter((r) => r.customer_id === customers[0]!.id);
    expect(rows.map((r) => [r.direction, r.kind, r.status])).toEqual([
      ['out', 'text', 'replied'],
      ['in', 'text', 'received'],
      ['forward', 'text', 'sent'],
    ]);
    // The forward holds only what the customer said; the name and number are added when drawn.
    expect(rows.find((r) => r.direction === 'forward')!.body).toBe('Can you do Thursday?');
    expect(await realCounts(owner.id)).toEqual({
      reschedules: 0,
      messages: 0,
      replies: 0,
      optOuts: 0,
    });
  });

  it('STOP skips that customer on the next practice send; START brings them back; real opt-outs are untouched', async () => {
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
        customerId: customers[1]!.id,
        body: 'START',
        businessName: 'Green Gulf Lawn',
      }),
    ).toMatchObject({ ok: true });
    expect((await listPracticeOptedOutIds(owner.client)).size).toBe(0);
    expect(await realCounts(owner.id)).toMatchObject({ optOuts: 0 });
  });

  it('a practice STOP or START never writes or clears a REAL opt-out', async () => {
    const { owner, customers, reply } = await started();
    await service
      .schema('rain_day')
      .from('opt_outs')
      .insert({ owner_id: owner.id, phone: customers[2]!.phone });
    await reply(2, 'START');
    await reply(0, 'STOP');
    const real = await service
      .schema('rain_day')
      .from('opt_outs')
      .select('phone')
      .eq('owner_id', owner.id);
    expect(real.data).toEqual([{ phone: customers[2]!.phone }]);
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
        customerId: customers[index]!.id,
        body,
        businessName: 'Green Gulf Lawn',
      });
    const bubbles = () => listPracticeMessages(owner.client, sent.rescheduleId);
    return { owner, customers, ctx, sent, reply, bubbles };
  }

  it('HELP is answered once with the business name, and a plain Yes is forwarded', async () => {
    const { reply, bubbles } = await started();
    await reply(2, 'HELP');
    await reply(2, 'help');
    await reply(0, 'Yes');
    const rows = await bubbles();
    const helps = rows.filter((r) => r.kind === 'help');
    expect(helps).toHaveLength(1);
    expect(helps[0]!.body).toBe(
      'Green Gulf Lawn: reply STOP to opt out. Msg & data rates may apply.',
    );
    expect(rows.filter((r) => r.direction === 'forward').map((r) => r.body)).toEqual(['Yes']);
  });

  it('another owner’s customer or practice rain day is rejected (IDOR)', async () => {
    const mine = await started();
    const theirs = await started();
    const attempt = (customerId: string, rescheduleId: string) =>
      replyPractice(mine.ctx, { rescheduleId, customerId, body: 'hi', businessName: 'x' });
    // Their customer in my practice rain day, my customer in their practice rain day, and both theirs.
    for (const [customerId, rescheduleId] of [
      [theirs.customers[0]!.id, mine.sent.rescheduleId],
      [mine.customers[0]!.id, theirs.sent.rescheduleId],
      [theirs.customers[0]!.id, theirs.sent.rescheduleId],
    ] as const) {
      expect((await attempt(customerId, rescheduleId)).ok).toBe(false);
    }
    // Nothing was written for either owner.
    const { count } = await service
      .schema('rain_day')
      .from('practice_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'in')
      .in('owner_id', [mine.owner.id, theirs.owner.id]);
    expect(count).toBe(0);
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
    expect(await clearPractice(ctx)).toMatchObject({ ok: true });
    expect(await bubbles()).toEqual([]);
    expect(await realCounts(owner.id)).toMatchObject({ reschedules: 1, optOuts: 1 });
  });

  it('deleting a customer deletes their practice bubbles too', async () => {
    const { owner, customers, bubbles } = await started();
    await service.schema('rain_day').from('customers').delete().eq('id', customers[0]!.id);
    const rows = await bubbles();
    expect(rows.some((r) => r.customer_id === customers[0]!.id)).toBe(false);
    expect(rows).toHaveLength(2);
    expect(owner.id).toBeTruthy();
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
