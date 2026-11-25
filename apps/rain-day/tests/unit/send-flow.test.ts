import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@speedy/db/types';
import { fakeProvider } from '@speedy/sms/fake';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyDeliveryEvent } from '@/features/rain-day/delivery-store';
import { planMessages } from '@/features/rain-day/plan';
import { sendQueuedMessages } from '@/features/rain-day/send-queued';

/**
 * The send flow end to end against the local Supabase stack with the fake SMS provider:
 * 15 customers, two opted out, a double tap, and delivery events. Needs DB_TESTS=1 and
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(process.env.DB_TESTS && url && anon && serviceKey);

type Client = SupabaseClient<Database>;
let service: Client;
let owner: Client;
let ownerId: string;
// One provider for the file: its ids (FAKE0001…) never repeat between tests.
const provider = fakeProvider();
const phones: string[] = [];

async function signedIn(email: string): Promise<{ client: Client; id: string }> {
  const password = `pw-${crypto.randomUUID()}`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const client = createClient<Database>(url!, anon!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { client, id: created.data.user.id };
}

beforeAll(async () => {
  if (!enabled) return;
  service = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
  const me = await signedIn(`${crypto.randomUUID()}@resend.dev`);
  owner = me.client;
  ownerId = me.id;
  const rows = Array.from({ length: 15 }, (_, i) => {
    const phone = `+1239556${String(1000 + i)}`;
    phones.push(phone);
    return {
      owner_id: ownerId,
      name: `Customer${i} Test`,
      phone,
      service_day: 2,
      opted_out: i === 3 || i === 11,
    };
  });
  const { error } = await owner.schema('rain_day').from('customers').insert(rows);
  if (error) throw error;
});

afterAll(async () => {
  if (enabled) await service.auth.admin.deleteUser(ownerId);
});

async function createRainDay(key: string, customers: Awaited<ReturnType<typeof load>>) {
  const plan = planMessages({
    customers,
    selectedIds: customers.map((c) => c.id),
    template: 'Hi {first_name}, moving you to {new_day}. — Green Gulf Lawn',
    newDay: 'Wednesday',
  });
  const { data, error } = await owner.schema('rain_day').rpc('create_reschedule', {
    p_idempotency_key: key,
    p_from_date: '2026-12-01',
    p_to_date: '2026-12-02',
    p_template: 'Hi {first_name}, moving you to {new_day}. — Green Gulf Lawn',
    p_messages: plan as unknown as Json,
  });
  if (error) throw error;
  return data[0]!;
}

async function load() {
  const { data, error } = await owner
    .schema('rain_day')
    .from('customers')
    .select('*')
    .order('name');
  if (error) throw error;
  return data;
}

describe.skipIf(!enabled)('rain day send flow (local Supabase, fake provider)', () => {
  it('sends 15 separate texts, skips opted-out customers, and a double tap sends nothing twice', async () => {
    const customers = await load();
    const key = crypto.randomUUID();

    const first = await createRainDay(key, customers);
    expect(first.created).toBe(true);
    await sendQueuedMessages({
      db: owner,
      service,
      ownerId,
      rescheduleId: first.reschedule_id,
      customers,
      provider,
      from: '+12395550100',
      businessName: 'Green Gulf Lawn',
    });

    // The double tap: same key. Nothing new is created, so the caller sends nothing.
    const second = await createRainDay(key, customers);
    expect(second).toEqual({ reschedule_id: first.reschedule_id, created: false });

    expect(provider.sent).toHaveLength(13);
    expect(new Set(provider.sent.map((s) => s.to)).size).toBe(13);
    const optedOut = [phones[3], phones[11]];
    expect(provider.sent.map((s) => s.to)).not.toEqual(expect.arrayContaining(optedOut));
    for (const s of provider.sent) {
      for (const p of phones) expect(s.body).not.toContain(p.slice(2));
    }

    const { data: rows } = await owner
      .schema('rain_day')
      .from('reschedule_messages')
      .select('status, customer_name, provider_message_id')
      .eq('reschedule_id', first.reschedule_id);
    expect(rows).toHaveLength(15);
    expect(rows!.filter((r) => r.status === 'sent')).toHaveLength(13);
    expect(
      rows!
        .filter((r) => r.status === 'skipped')
        .map((r) => r.customer_name)
        .sort(),
    ).toEqual(['Customer11 Test', 'Customer3 Test']);
    expect(rows!.filter((r) => r.provider_message_id)).toHaveLength(13);

    // Delivery events move a message forward once, and a late "sent" cannot undo "delivered".
    const id = provider.sent[0]!.providerMessageId;
    await applyDeliveryEvent(service, {
      kind: 'delivery',
      providerMessageId: id,
      status: 'delivered',
    });
    await applyDeliveryEvent(service, { kind: 'delivery', providerMessageId: id, status: 'sent' });
    const { data: after } = await owner
      .schema('rain_day')
      .from('reschedule_messages')
      .select('status')
      .eq('provider_message_id', id)
      .single();
    expect(after?.status).toBe('delivered');
    await applyDeliveryEvent(service, {
      kind: 'delivery',
      providerMessageId: id,
      status: 'failed',
    });
    const { data: still } = await owner
      .schema('rain_day')
      .from('reschedule_messages')
      .select('status')
      .eq('provider_message_id', id)
      .single();
    expect(still?.status).toBe('delivered');
  });

  it('two taps at the same time still make one rain day and one text each', async () => {
    const customers = (await load()).filter((c) => !c.opted_out);
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([
      createRainDay(key, customers),
      createRainDay(key, customers),
    ]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.reschedule_id).toBe(b.reschedule_id);
  });

  it('a failed text is recorded as failed and does not stop the others', async () => {
    const customers = (await load()).filter((c) => !c.opted_out);
    provider.failNext();
    const created = await createRainDay(crypto.randomUUID(), customers);
    await sendQueuedMessages({
      db: owner,
      service,
      ownerId,
      rescheduleId: created.reschedule_id,
      customers,
      provider,
      from: '+12395550100',
      businessName: 'Green Gulf Lawn',
    });
    const { data } = await owner
      .schema('rain_day')
      .from('reschedule_messages')
      .select('status')
      .eq('reschedule_id', created.reschedule_id);
    expect(data!.filter((r) => r.status === 'failed')).toHaveLength(1);
    expect(data!.filter((r) => r.status === 'sent')).toHaveLength(customers.length - 1);
  });
});
