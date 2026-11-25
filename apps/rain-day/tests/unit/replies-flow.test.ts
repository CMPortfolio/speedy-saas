import type { Database } from '@speedy/db/types';
import type { E164 } from '@speedy/lib/phone';
import { fakeProvider } from '@speedy/sms/fake';
import { checkPhoneVerification, startPhoneVerification } from '@speedy/sms/verify-phone';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundText } from '@/features/replies/handle-inbound';
import { createInboundStore } from '@/features/replies/reply-store';
import { listOptedOutPhones } from '@/features/rain-day/queries';
import { runSend } from '@/features/rain-day/send-core';
import { saveVerifiedCell } from '@/features/settings/owner-cell';
import { createVerifyStore } from '@/features/settings/verify-store';

/**
 * Replies, forwarding, STOP/START, per-owner numbers and cell verification against the local
 * Supabase stack with the fake SMS provider. Needs DB_TESTS=1 and the three Supabase env vars.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(process.env.DB_TESTS && url && anon && serviceKey);
const TIMEOUT = { timeout: 60_000 };

type Client = SupabaseClient<Database>;
type Owner = { client: Client; id: string; number: E164; cell: E164; sid: string };

function freshNumber(prefix: string): E164 {
  // Exchange x2y is never reserved, so these pass the US check.
  return `+1239${prefix}${String(Math.floor(Math.random() * 100_000)).padStart(5, '0')}` as E164;
}

let service: Client;
const created: string[] = [];
const provider = fakeProvider();
let a: Owner;
let b: Owner;
const maria = freshNumber('72');
const pat = freshNumber('73');

async function signedIn(): Promise<{ client: Client; id: string }> {
  const email = `${crypto.randomUUID()}@resend.dev`;
  const password = `pw-${crypto.randomUUID()}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw made.error;
  created.push(made.data.user.id);
  const client = createClient<Database>(url!, anon!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { client, id: made.data.user.id };
}

/** A signed-in owner with their own texting number (set the way an admin would) and verified cell. */
async function owner(name: string): Promise<Owner> {
  const who = await signedIn();
  const number = freshNumber('74');
  const cell = freshNumber('75');
  const sid = `MG${crypto.randomUUID().replaceAll('-', '')}`;
  await service
    .schema('rain_day')
    .from('owner_settings')
    .upsert(
      { owner_id: who.id, sender_number: number, sender_messaging_service_sid: sid },
      { onConflict: 'owner_id' },
    );
  await saveVerifiedCell(service, who.id, cell);
  await service.from('profiles').update({ business_name: name }).eq('id', who.id);
  return { ...who, number, cell, sid };
}

async function addCustomer(o: Owner, name: string, phone: string) {
  const { error } = await service
    .schema('rain_day')
    .from('customers')
    .insert({ owner_id: o.id, name, phone, service_day: 2 });
  if (error) throw error;
}

async function sendRainDay(o: Owner) {
  const { data: customers } = await o.client.schema('rain_day').from('customers').select('*');
  const result = await runSend(
    {
      db: o.client,
      service,
      ownerId: o.id,
      customers: customers!,
      optedOutPhones: await listOptedOutPhones(o.client),
      businessName: 'Green Gulf Lawn',
      provider,
      sender: { from: o.number, messagingServiceSid: o.sid },
      today: '2026-11-24',
    },
    {
      idempotencyKey: crypto.randomUUID(),
      from: '2026-12-01',
      to: '2026-12-02',
      template: 'Hi {first_name}, moving you to {new_day}.',
      customerIds: customers!.map((c) => c.id),
    },
  );
  if (!result.ok) throw new Error(result.message);
  return result.rescheduleId;
}

const inboundStore = () => createInboundStore(service);
const text = (to: E164, from: E164, body: string) => ({
  kind: 'inbound' as const,
  from,
  to,
  body,
  providerMessageId: `IN-${crypto.randomUUID()}`,
});
const receive = (to: E164, from: E164, body: string) =>
  handleInboundText({ provider, store: inboundStore() }, text(to, from, body));

beforeAll(async () => {
  if (!enabled) return;
  service = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
  a = await owner('Green Gulf Lawn');
  b = await owner('Blue Gulf Pools');
  // A competitor (B) imports A's customer too, and also has a customer of their own.
  await addCustomer(a, 'Maria Lopez', maria);
  await addCustomer(b, 'Maria L', maria);
  await addCustomer(b, 'Pat Ruiz', pat);
  await sendRainDay(a);
  await sendRainDay(b);
});

afterAll(async () => {
  if (!enabled) return;
  for (const id of created) await service.auth.admin.deleteUser(id);
});

describe.skipIf(!enabled)(
  'per-owner numbers: replies go only to the owner who was texted',
  TIMEOUT,
  () => {
    it('each owner texted from their own number', () => {
      const fromMaria = provider.sent.filter((s) => s.to === maria);
      expect(fromMaria.map((s) => s.from).sort()).toEqual([a.number, b.number].sort());
    });

    it('a reply to A’s number is filed and forwarded to A only, never to B', async () => {
      const before = provider.sent.length;
      const message = text(a.number, maria, 'Can you do Thursday instead?');
      await handleInboundText({ provider, store: inboundStore() }, message);
      // A repeat delivery of the same provider id changes nothing and forwards nothing.
      await handleInboundText({ provider, store: inboundStore() }, message);

      const forwarded = provider.sent.slice(before);
      expect(forwarded).toHaveLength(1);
      expect(forwarded[0]).toMatchObject({
        to: a.cell,
        from: a.number,
        messagingServiceSid: a.sid,
      });
      expect(forwarded[0]!.body).toContain('Maria Lopez');
      expect(forwarded[0]!.body).toContain('Can you do Thursday instead?');

      const replies = (o: Owner) => o.client.schema('rain_day').from('replies').select('*');
      expect((await replies(a)).data).toHaveLength(1);
      expect((await replies(b)).data).toHaveLength(0);
      const statusOf = async (o: Owner) =>
        (
          await o.client
            .schema('rain_day')
            .from('reschedule_messages')
            .select('status')
            .eq('customer_name', o === a ? 'Maria Lopez' : 'Maria L')
        ).data;
      expect(await statusOf(a)).toEqual([{ status: 'replied' }]);
      expect(await statusOf(b)).toEqual([{ status: 'sent' }]);
    });

    it('a reply to B’s number goes to B only', async () => {
      const before = provider.sent.length;
      await receive(b.number, maria, 'Wednesday is fine');
      const forwarded = provider.sent.slice(before);
      expect(forwarded).toHaveLength(1);
      expect(forwarded[0]).toMatchObject({
        to: b.cell,
        from: b.number,
        messagingServiceSid: b.sid,
      });
      expect(forwarded[0]!.body).toContain('Maria L');
    });

    it('a text to a number that is nobody’s stores nothing and sends nothing', async () => {
      const before = provider.sent.length;
      const stray = freshNumber('76');
      await receive(stray, maria, 'hello?');
      await receive(stray, maria, 'STOP');
      await receive(stray, maria, 'HELP');
      expect(provider.sent.length).toBe(before);
      const { data } = await service
        .schema('rain_day')
        .from('opt_outs')
        .select('id')
        .eq('phone', maria);
      expect(data).toHaveLength(0);
    });

    it('owner A cannot see owner B’s customers, sends or replies, and the reverse', async () => {
      for (const [me, other] of [
        [a, pat],
        [b, null],
      ] as const) {
        const db = me.client.schema('rain_day');
        const customers = await db.from('customers').select('phone');
        expect(customers.data!.map((c) => c.phone)).not.toContain(other ?? '');
        expect((await db.from('reschedules').select('id')).data).toHaveLength(1);
      }
      expect(
        (await a.client.schema('rain_day').from('customers').select('id')).data ?? [],
      ).toHaveLength(1);
      const anonymous = createClient<Database>(url!, anon!, { auth: { persistSession: false } });
      expect(
        (await anonymous.schema('rain_day').from('replies').select('id')).data ?? [],
      ).toHaveLength(0);
    });
  },
);

describe.skipIf(!enabled)('STOP, START, HELP and plain replies', TIMEOUT, () => {
  /** A fresh owner (one send a day each, so the daily limit never gets in the way). */
  async function freshOwner(customers: [string, E164][]) {
    const o = await owner('Green Gulf Lawn');
    for (const [name, phone] of customers) await addCustomer(o, name, phone);
    return o;
  }
  const sentTo = (phone: E164) => provider.sent.filter((s) => s.to === phone).length;
  const statusFor = async (o: Owner, rescheduleId: string, name: string) =>
    (
      await o.client
        .schema('rain_day')
        .from('reschedule_messages')
        .select('status')
        .eq('reschedule_id', rescheduleId)
        .eq('customer_name', name)
    ).data;

  it('STOP is recorded for the owner texted even when the number is not on their list yet', async () => {
    const o = await freshOwner([]);
    const stranger = freshNumber('77');
    await receive(o.number, stranger, 'STOP');
    expect((await listOptedOutPhones(o.client)).has(stranger)).toBe(true);
    // The customer shows up afterwards: the opt-out is already there, so they are skipped.
    await addCustomer(o, 'Late Arrival', stranger);
    const rescheduleId = await sendRainDay(o);
    expect(sentTo(stranger)).toBe(0);
    expect(await statusFor(o, rescheduleId, 'Late Arrival')).toEqual([{ status: 'skipped' }]);
  });

  it('STOP survives deleting the customer and importing them again; YES brings them back', async () => {
    const phone = freshNumber('72');
    const o = await freshOwner([['Maria Lopez', phone]]);
    await sendRainDay(o);
    await receive(o.number, phone, 'STOP');
    expect((await listOptedOutPhones(o.client)).has(phone)).toBe(true);
    const customers = o.client.schema('rain_day').from('customers');
    await customers.delete().eq('phone', phone);
    await customers.insert({ owner_id: o.id, name: 'Maria Lopez', phone, service_day: 2 });
    expect((await listOptedOutPhones(o.client)).has(phone)).toBe(true);

    const before = sentTo(phone);
    const rescheduleId = await sendRainDay(o);
    expect(sentTo(phone)).toBe(before);
    expect(await statusFor(o, rescheduleId, 'Maria Lopez')).toEqual([{ status: 'skipped' }]);

    await receive(o.number, phone, 'YES');
    expect((await listOptedOutPhones(o.client)).has(phone)).toBe(false);
  });

  it('a STOP to one owner’s number does not skip another owner’s send, and the other owner never sees it', async () => {
    const phone = freshNumber('73');
    const first = await freshOwner([['Pat Ruiz', phone]]);
    const second = await freshOwner([['Pat R', phone]]);
    await receive(first.number, phone, 'STOP');

    expect((await listOptedOutPhones(first.client)).has(phone)).toBe(true);
    expect((await listOptedOutPhones(second.client)).has(phone)).toBe(false);
    const theirs = await second.client.schema('rain_day').from('opt_outs').select('id');
    expect(theirs.data).toEqual([]);

    const blocked = await sendRainDay(first);
    expect(await statusFor(first, blocked, 'Pat Ruiz')).toEqual([{ status: 'skipped' }]);
    const before = sentTo(phone);
    const allowed = await sendRainDay(second);
    expect(sentTo(phone)).toBe(before + 1);
    expect(await statusFor(second, allowed, 'Pat R')).toEqual([{ status: 'sent' }]);
  });

  it('START to one owner’s number clears only that owner’s STOP', async () => {
    const phone = freshNumber('73');
    const first = await freshOwner([['Pat Ruiz', phone]]);
    const second = await freshOwner([['Pat R', phone]]);
    await receive(first.number, phone, 'STOP');
    await receive(second.number, phone, 'STOP');
    // START to B clears B's entry only: A stays blocked, B is unaffected by A.
    await receive(second.number, phone, 'START');
    expect((await listOptedOutPhones(first.client)).has(phone)).toBe(true);
    expect((await listOptedOutPhones(second.client)).has(phone)).toBe(false);
    const blocked = await sendRainDay(first);
    expect(await statusFor(first, blocked, 'Pat Ruiz')).toEqual([{ status: 'skipped' }]);
    const before = sentTo(phone);
    await sendRainDay(second);
    expect(sentTo(phone)).toBe(before + 1);
  });

  it('HELP is answered separately for each owner’s number', async () => {
    const phone = freshNumber('72');
    const first = await freshOwner([['Maria', phone]]);
    const second = await freshOwner([['Maria L', phone]]);
    const before = provider.sent.length;
    await receive(first.number, phone, 'HELP');
    await receive(second.number, phone, 'HELP');
    await receive(first.number, phone, 'HELP');
    const answers = provider.sent.slice(before);
    expect(answers.map((a) => a.from).sort()).toEqual([first.number, second.number].sort());
  });

  it('a plain "Yes" from someone who is not opted out is forwarded, not swallowed', async () => {
    const phone = freshNumber('72');
    const o = await freshOwner([['Maria Lopez', phone]]);
    await sendRainDay(o);
    const before = provider.sent.length;
    await receive(o.number, phone, 'Yes');
    const forwarded = provider.sent.slice(before);
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]).toMatchObject({ to: o.cell });
    expect(forwarded[0]!.body).toContain('"Yes"');
  });

  it('HELP is answered once a day for that owner’s customer, from their number, never for a stranger', async () => {
    const phone = freshNumber('72');
    const o = await freshOwner([['Maria Lopez', phone]]);
    const before = provider.sent.length;
    await receive(o.number, phone, 'HELP');
    await receive(o.number, phone, 'HELP');
    await receive(o.number, freshNumber('78'), 'HELP');
    const answers = provider.sent.slice(before);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({
      to: phone,
      from: o.number,
      messagingServiceSid: o.sid,
    });
    expect(answers[0]!.body).toBe(
      'Green Gulf Lawn: reply STOP to opt out. Msg & data rates may apply.',
    );
  });
});

describe.skipIf(!enabled)('owner cell verification against the database', TIMEOUT, () => {
  const codeFrom = (sent: { body: string }) => /(\d{6})/.exec(sent.body)![1]!;
  const sender = freshNumber('79');

  it('texts a code, limits to 3 an hour, locks after 5 wrong tries, and verifies the right code once', async () => {
    const who = await signedIn();
    const sms = fakeProvider();
    const store = createVerifyStore(service);
    const cell = freshNumber('71');
    const start = () =>
      startPhoneVerification(
        { provider: sms, store },
        { subject: who.id, phone: cell, from: sender },
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
      .eq('owner_id', who.id)
      .single();
    const code = codeFrom(sms.sent[2]!);
    expect(JSON.stringify(stored)).not.toContain(code);

    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 4; i >= 1; i--) {
      expect(await checkPhoneVerification({ store }, { subject: who.id, code: wrong })).toEqual({
        status: 'wrong',
        attemptsLeft: i,
      });
    }
    expect((await checkPhoneVerification({ store }, { subject: who.id, code: wrong })).status).toBe(
      'locked',
    );
    expect((await checkPhoneVerification({ store }, { subject: who.id, code })).status).toBe(
      'none',
    );
  });

  it('accepts the right code exactly once and refuses an expired one', async () => {
    const who = await signedIn();
    const sms = fakeProvider();
    const store = createVerifyStore(service);
    const cell = freshNumber('71');
    await startPhoneVerification(
      { provider: sms, store },
      { subject: who.id, phone: cell, from: sender },
    );
    const code = codeFrom(sms.sent[0]!);
    expect(await checkPhoneVerification({ store }, { subject: who.id, code })).toEqual({
      status: 'verified',
      phone: cell,
    });
    expect((await checkPhoneVerification({ store }, { subject: who.id, code })).status).toBe(
      'none',
    );

    await startPhoneVerification(
      { provider: sms, store },
      { subject: who.id, phone: cell, from: sender },
    );
    const later = () => new Date(Date.now() + 10 * 60_000 + 1000);
    const expired = await checkPhoneVerification(
      { store, now: later },
      { subject: who.id, code: codeFrom(sms.sent[1]!) },
    );
    expect(expired.status).toBe('expired');
  });

  it('stops at 6 codes a day even when the hour is clear', async () => {
    const who = await signedIn();
    await service
      .schema('rain_day')
      .from('verification_sends')
      .insert(
        Array.from({ length: 6 }, () => ({
          owner_id: who.id,
          created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        })),
      );
    const sms = fakeProvider();
    const res = await startPhoneVerification(
      { provider: sms, store: createVerifyStore(service) },
      { subject: who.id, phone: freshNumber('71'), from: sender },
    );
    expect(!res.ok && res.error.code).toBe('rate_limited');
    expect(sms.sent).toHaveLength(0);
  });
});
