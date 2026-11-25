import type { Database, Json } from '@speedy/db/types';
import type { E164 } from '@speedy/lib/phone';
import { fakeProvider } from '@speedy/sms/fake';
import { checkPhoneVerification, startPhoneVerification } from '@speedy/sms/verify-phone';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundText } from '@/features/replies/handle-inbound';
import { createReplyStore } from '@/features/replies/reply-store';
import { planMessages } from '@/features/rain-day/plan';
import { sendQueuedMessages } from '@/features/rain-day/send-queued';
import { saveVerifiedCell } from '@/features/settings/owner-cell';
import { createVerifyStore } from '@/features/settings/verify-store';

/**
 * Replies, forwarding, STOP/START, cell verification and owner isolation against the local
 * Supabase stack with the fake SMS provider. Needs DB_TESTS=1 and the three Supabase env vars.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(process.env.DB_TESTS && url && anon && serviceKey);

type Client = SupabaseClient<Database>;
const BUSINESS = '+12395550100' as E164;
const OWNER_A_CELL = '+12395550911' as E164;

function freshPhone(): E164 {
  return `+12397${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}` as E164;
}

let service: Client;
const owners: Record<'a' | 'b', { client: Client; id: string }> = {} as never;
const phones = { maria: freshPhone(), pat: freshPhone() };
let rescheduleA: string;
const provider = fakeProvider();

async function signedIn(): Promise<{ client: Client; id: string }> {
  const email = `${crypto.randomUUID()}@resend.dev`;
  const password = `pw-${crypto.randomUUID()}`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const client = createClient<Database>(url!, anon!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { client, id: created.data.user.id };
}

async function sendRainDay(owner: { client: Client; id: string }) {
  const { data: customers } = await owner.client.schema('rain_day').from('customers').select('*');
  const plan = planMessages({
    customers: customers!,
    selectedIds: customers!.map((c) => c.id),
    template: 'Hi {first_name}, moving you to {new_day}.',
    newDay: 'Wednesday',
  });
  const { data, error } = await owner.client.schema('rain_day').rpc('create_reschedule', {
    p_idempotency_key: crypto.randomUUID(),
    p_from_date: '2026-12-01',
    p_to_date: '2026-12-02',
    p_template: 'Hi {first_name}, moving you to {new_day}.',
    p_messages: plan as unknown as Json,
  });
  if (error) throw error;
  await sendQueuedMessages({
    db: owner.client,
    service,
    ownerId: owner.id,
    rescheduleId: data[0]!.reschedule_id,
    customers: customers!,
    provider,
    from: BUSINESS,
    businessName: 'Green Gulf Lawn',
  });
  return data[0]!.reschedule_id;
}

beforeAll(async () => {
  if (!enabled) return;
  service = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
  owners.a = await signedIn();
  owners.b = await signedIn();
  const insert = (id: string, name: string, phone: string) =>
    service
      .schema('rain_day')
      .from('customers')
      .insert({ owner_id: id, name, phone, service_day: 2 });
  await insert(owners.a.id, 'Maria Lopez', phones.maria);
  await insert(owners.b.id, 'Pat Ruiz', phones.pat);
  rescheduleA = await sendRainDay(owners.a);
  await sendRainDay(owners.b);
  await saveVerifiedCell(service, owners.a.id, OWNER_A_CELL);
});

afterAll(async () => {
  if (!enabled) return;
  await service.auth.admin.deleteUser(owners.a.id);
  await service.auth.admin.deleteUser(owners.b.id);
});

const inbound = (from: E164, body: string) => ({
  kind: 'inbound' as const,
  from,
  to: BUSINESS,
  body,
  providerMessageId: `IN-${crypto.randomUUID()}`,
});

describe.skipIf(!enabled)('replies and forwarding (local Supabase, fake provider)', () => {
  it('files a reply under the latest message, marks it replied, and texts the owner with the name', async () => {
    const before = provider.sent.length;
    const store = createReplyStore(service);
    const message = inbound(phones.maria, 'Can you do Thursday instead?');
    await handleInboundText({ provider, store }, message);
    // A repeat delivery of the same provider id changes nothing and forwards nothing.
    await handleInboundText({ provider, store }, message);

    const forwarded = provider.sent.slice(before);
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]).toMatchObject({ to: OWNER_A_CELL });
    expect(forwarded[0]!.body).toContain('Maria Lopez');
    expect(forwarded[0]!.body).toContain('Can you do Thursday instead?');

    const { data: replies } = await owners.a.client.schema('rain_day').from('replies').select('*');
    expect(replies).toHaveLength(1);
    expect(replies![0]).toMatchObject({ customer_name: 'Maria Lopez', forward_status: 'sent' });
    const { data: msgs } = await owners.a.client
      .schema('rain_day')
      .from('reschedule_messages')
      .select('status')
      .eq('reschedule_id', rescheduleA);
    expect(msgs).toEqual([{ status: 'replied' }]);
  });

  it('keeps a reply for an owner with no verified cell, without forwarding it', async () => {
    const before = provider.sent.length;
    await handleInboundText(
      { provider, store: createReplyStore(service) },
      inbound(phones.pat, 'ok'),
    );
    expect(provider.sent.length).toBe(before);
    const { data } = await owners.b.client
      .schema('rain_day')
      .from('replies')
      .select('forward_status');
    expect(data).toEqual([{ forward_status: 'not_set_up' }]);
  });

  it('owner A cannot see owner B’s customers, sends or replies, and the reverse', async () => {
    for (const [me, other] of [
      [owners.a, phones.pat],
      [owners.b, phones.maria],
    ] as const) {
      const db = me.client.schema('rain_day');
      const customers = await db.from('customers').select('phone');
      expect(customers.data!.map((c) => c.phone)).not.toContain(other);
      expect(customers.data).toHaveLength(1);
      expect((await db.from('reschedules').select('id')).data).toHaveLength(1);
      expect((await db.from('reschedule_messages').select('id')).data).toHaveLength(1);
      expect((await db.from('replies').select('id')).data).toHaveLength(1);
    }
    const anonymous = createClient<Database>(url!, anon!, { auth: { persistSession: false } });
    const seen = await anonymous.schema('rain_day').from('replies').select('id');
    expect(seen.data ?? []).toHaveLength(0);
  });

  it('an owner cannot give themselves a verified cell or read verification state', async () => {
    const db = owners.b.client.schema('rain_day');
    const write = await db.from('owner_settings').insert({
      owner_id: owners.b.id,
      owner_cell: '+12395550888',
      owner_cell_verified_at: new Date().toISOString(),
    });
    expect(write.error).not.toBeNull();
    expect((await db.from('phone_verifications').select('*')).error).not.toBeNull();
    const rpc = await db.rpc('record_reply', {
      p_from: phones.pat,
      p_provider_message_id: 'x',
      p_body: 'x',
      p_forward_cap: 1000,
    });
    expect(rpc.error).not.toBeNull();
  });

  it('STOP opts the customer out and a later rain day skips them; START brings them back', async () => {
    const store = createReplyStore(service);
    await handleInboundText({ provider, store }, inbound(phones.maria, 'STOP'));
    const optedOut = async () =>
      (await owners.a.client.schema('rain_day').from('customers').select('opted_out')).data![0]!
        .opted_out;
    expect(await optedOut()).toBe(true);

    const before = provider.sent.length;
    const second = await sendRainDay(owners.a);
    expect(provider.sent.length).toBe(before);
    const { data } = await owners.a.client
      .schema('rain_day')
      .from('reschedule_messages')
      .select('status')
      .eq('reschedule_id', second);
    expect(data).toEqual([{ status: 'skipped' }]);

    await handleInboundText({ provider, store }, inbound(phones.maria, 'START'));
    expect(await optedOut()).toBe(false);
  });
});

describe.skipIf(!enabled)('owner cell verification against the database', () => {
  const codeFrom = (sent: { body: string }) => /(\d{6})/.exec(sent.body)![1]!;

  it('texts a code, limits to 3 an hour, locks after 5 wrong tries, and verifies the right code once', async () => {
    const owner = await signedIn();
    const sms = fakeProvider();
    const store = createVerifyStore(service);
    const cell = freshPhone();
    const start = () =>
      startPhoneVerification(
        { provider: sms, store },
        { subject: owner.id, phone: cell, from: BUSINESS },
      );

    for (let i = 0; i < 3; i++) expect((await start()).ok).toBe(true);
    const fourth = await start();
    expect(!fourth.ok && fourth.error.code).toBe('rate_limited');
    expect(sms.sent).toHaveLength(3);
    expect(sms.sent.every((s) => s.to === cell)).toBe(true);

    const { data: stored } = await service
      .schema('rain_day')
      .from('phone_verifications')
      .select('*')
      .eq('owner_id', owner.id)
      .single();
    const code = codeFrom(sms.sent[2]!);
    expect(JSON.stringify(stored)).not.toContain(code);

    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 4; i >= 1; i--) {
      expect(await checkPhoneVerification({ store }, { subject: owner.id, code: wrong })).toEqual({
        status: 'wrong',
        attemptsLeft: i,
      });
    }
    expect(
      (await checkPhoneVerification({ store }, { subject: owner.id, code: wrong })).status,
    ).toBe('locked');
    expect((await checkPhoneVerification({ store }, { subject: owner.id, code })).status).toBe(
      'none',
    );
    await service.auth.admin.deleteUser(owner.id);
  });

  it('accepts the right code exactly once and refuses an expired one', async () => {
    const owner = await signedIn();
    const sms = fakeProvider();
    const store = createVerifyStore(service);
    const cell = freshPhone();
    await startPhoneVerification(
      { provider: sms, store },
      { subject: owner.id, phone: cell, from: BUSINESS },
    );
    const code = codeFrom(sms.sent[0]!);
    expect(await checkPhoneVerification({ store }, { subject: owner.id, code })).toEqual({
      status: 'verified',
      phone: cell,
    });
    expect((await checkPhoneVerification({ store }, { subject: owner.id, code })).status).toBe(
      'none',
    );

    await startPhoneVerification(
      { provider: sms, store },
      { subject: owner.id, phone: cell, from: BUSINESS },
    );
    const later = () => new Date(Date.now() + 10 * 60_000 + 1000);
    const expired = await checkPhoneVerification(
      { store, now: later },
      { subject: owner.id, code: codeFrom(sms.sent[1]!) },
    );
    expect(expired.status).toBe('expired');
    await service.auth.admin.deleteUser(owner.id);
  });
});
