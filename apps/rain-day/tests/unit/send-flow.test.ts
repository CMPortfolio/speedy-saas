import type { Database } from '@speedy/db/types';
import { fakeProvider } from '@speedy/sms/fake';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyDeliveryEvent } from '@/features/rain-day/delivery-store';
import { listOptedOutPhones } from '@/features/rain-day/queries';
import { runSend, type SendContext } from '@/features/rain-day/send-core';

/**
 * The send flow end to end against the local Supabase stack with the fake SMS provider:
 * 15 customers, two opted out, a double tap, delivery events, limits and failures. Needs
 * DB_TESTS=1 and NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
 * SUPABASE_SERVICE_ROLE_KEY.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(process.env.DB_TESTS && url && anon && serviceKey);

type Client = SupabaseClient<Database>;
type Owner = { client: Client; id: string };
let service: Client;
const created: string[] = [];
const TEMPLATE = 'Hi {first_name}, moving you to {new_day}. — Green Gulf Lawn';

/** A valid US number per call (exchange 62x is never reserved), unique enough per run. */
function freshPhone(): string {
  return `+123962${String(Math.floor(Math.random() * 100_000)).padStart(5, '0')}`;
}

async function signedIn(): Promise<Owner> {
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

async function ownerWithCustomers(count: number, optedOut: number[] = []) {
  const owner = await signedIn();
  const phones = Array.from({ length: count }, () => freshPhone());
  const { error } = await service
    .schema('rain_day')
    .from('customers')
    .insert(
      phones.map((phone, i) => ({
        owner_id: owner.id,
        name: `Customer${i} Test`,
        phone,
        service_day: 2,
      })),
    );
  if (error) throw error;
  if (optedOut.length > 0) {
    await service
      .schema('rain_day')
      .from('opt_outs')
      .insert(optedOut.map((i) => ({ owner_id: owner.id, phone: phones[i]! })));
  }
  return { owner, phones };
}

async function context(owner: Owner, provider = fakeProvider(), db: Client = owner.client) {
  const { data } = await owner.client.schema('rain_day').from('customers').select('*');
  const ctx: SendContext = {
    db,
    service,
    customers: data!,
    optedOutPhones: await listOptedOutPhones(owner.client),
    businessName: 'Green Gulf Lawn',
    provider,
    from: '+12395550100',
    today: '2026-11-24',
  };
  return { ctx, provider };
}

const request = (ctx: SendContext, key = crypto.randomUUID(), template = TEMPLATE) => ({
  idempotencyKey: key,
  from: '2026-12-01',
  to: '2026-12-02',
  template,
  customerIds: ctx.customers.map((c) => c.id),
});

async function statuses(owner: Owner, rescheduleId: string) {
  const { data } = await owner.client
    .schema('rain_day')
    .from('reschedule_messages')
    .select('status, error_code, customer_name, provider, provider_message_id')
    .eq('reschedule_id', rescheduleId);
  return data!;
}

beforeAll(() => {
  if (enabled)
    service = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
});

afterAll(async () => {
  if (enabled) for (const id of created) await service.auth.admin.deleteUser(id);
});

describe.skipIf(!enabled)(
  'rain day send flow (local Supabase, fake provider)',
  { timeout: 60_000 },
  () => {
    it('sends 15 separate texts minus the opted-out, and a second tap sends nothing', async () => {
      const { owner, phones } = await ownerWithCustomers(15, [3, 11]);
      const { ctx, provider } = await context(owner);
      const req = request(ctx);

      const first = await runSend(ctx, req);
      expect(first).toMatchObject({ ok: true, alreadySent: false });
      expect(provider.sent).toHaveLength(13);
      expect(new Set(provider.sent.map((s) => s.to)).size).toBe(13);
      expect(provider.sent.map((s) => s.to)).not.toEqual(
        expect.arrayContaining([phones[3], phones[11]]),
      );
      for (const s of provider.sent) {
        for (const p of phones) expect(s.body).not.toContain(p.slice(2));
      }

      const second = await runSend(ctx, req);
      expect(second).toMatchObject({ ok: true, alreadySent: true });
      expect(first.ok && second.ok && second.rescheduleId).toBe(first.ok && first.rescheduleId);
      expect(provider.sent).toHaveLength(13);

      const rows = await statuses(owner, first.ok ? first.rescheduleId : '');
      expect(rows).toHaveLength(15);
      expect(rows.filter((r) => r.status === 'sent')).toHaveLength(13);
      expect(rows.filter((r) => r.provider === 'fake' && r.provider_message_id)).toHaveLength(13);
      const skipped = rows.filter((r) => r.status === 'skipped');
      expect(skipped.map((r) => r.customer_name).sort()).toEqual([
        'Customer11 Test',
        'Customer3 Test',
      ]);
      expect(skipped.every((r) => r.error_code === 'opted_out')).toBe(true);
    });

    it('two taps at the same moment still send one text each', async () => {
      const { owner } = await ownerWithCustomers(6);
      const { ctx, provider } = await context(owner);
      const req = request(ctx);
      const [a, b] = await Promise.all([runSend(ctx, req), runSend(ctx, req)]);
      expect([a.ok && a.alreadySent, b.ok && b.alreadySent].sort()).toEqual([false, true]);
      expect(provider.sent).toHaveLength(6);
    });

    it('delivery events move a message forward once and never back', async () => {
      const { owner } = await ownerWithCustomers(2);
      const { ctx, provider } = await context(owner);
      const result = await runSend(ctx, request(ctx));
      const id = provider.sent[0]!.providerMessageId;
      const read = async () =>
        (
          await service
            .schema('rain_day')
            .from('reschedule_messages')
            .select('status')
            .eq('provider_message_id', id)
            .eq('reschedule_id', result.ok ? result.rescheduleId : '')
            .single()
        ).data?.status;
      const event = (status: 'delivered' | 'sent' | 'failed') =>
        applyDeliveryEvent(service, { kind: 'delivery', providerMessageId: id, status }, 'fake');
      await event('delivered');
      await event('sent');
      expect(await read()).toBe('delivered');
      await event('failed');
      expect(await read()).toBe('delivered');
      // An event naming a different provider never touches this row.
      await applyDeliveryEvent(
        service,
        {
          kind: 'delivery',
          providerMessageId: provider.sent[1]!.providerMessageId,
          status: 'failed',
        },
        'twilio',
      );
      const other = await statuses(owner, result.ok ? result.rescheduleId : '');
      expect(other.filter((r) => r.status === 'failed')).toHaveLength(0);
    });

    it('records a failed text as failed and still sends the others', async () => {
      const { owner } = await ownerWithCustomers(4);
      const { ctx, provider } = await context(owner);
      provider.failNext();
      const result = await runSend(ctx, request(ctx));
      const rows = await statuses(owner, result.ok ? result.rescheduleId : '');
      expect(rows.filter((r) => r.status === 'failed')).toHaveLength(1);
      expect(rows.filter((r) => r.status === 'sent')).toHaveLength(3);
    });

    it('reports honestly when the lookups before sending fail: nothing sent, rows left queued', async () => {
      const { owner } = await ownerWithCustomers(3);
      const flaky = new Proxy(owner.client, {
        get(target, prop) {
          if (prop !== 'schema') return Reflect.get(target, prop);
          return (name: 'rain_day') => {
            const schema = target.schema(name);
            return new Proxy(schema, {
              get(inner, p) {
                if (p === 'rpc') {
                  return (fn: string, args: never) =>
                    fn === 'previously_texted'
                      ? Promise.resolve({ data: null, error: { code: 'XX000', message: 'boom' } })
                      : inner.rpc(fn as never, args);
                }
                const value = Reflect.get(inner, p);
                return typeof value === 'function' ? value.bind(inner) : value;
              },
            });
          };
        },
      });
      const { ctx, provider } = await context(owner, fakeProvider(), flaky as Client);
      const result = await runSend(ctx, request(ctx));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.rescheduleId).toBeTruthy();
      expect(provider.sent).toHaveLength(0);
      const rows = await statuses(owner, !result.ok ? (result.rescheduleId ?? '') : '');
      expect(rows.every((r) => r.status === 'queued')).toBe(true);
    });
  },
);

describe.skipIf(!enabled)('rain day send flow: limits and skips', { timeout: 60_000 }, () => {
  it('skips a customer with a non-US number, with the reason', async () => {
    const owner = await signedIn();
    await service
      .schema('rain_day')
      .from('customers')
      .insert([
        { owner_id: owner.id, name: 'Eh Canada', phone: '+14165550123', service_day: 2 },
        { owner_id: owner.id, name: 'Local Lawn', phone: freshPhone(), service_day: 2 },
      ]);
    const { ctx, provider } = await context(owner);
    const result = await runSend(ctx, request(ctx));
    expect(provider.sent).toHaveLength(1);
    const rows = await statuses(owner, result.ok ? result.rescheduleId : '');
    expect(rows.find((r) => r.customer_name === 'Eh Canada')).toMatchObject({
      status: 'skipped',
      error_code: 'non_us',
    });
  });

  it('stops at 3 rain days a day with a plain message and sends nothing more', async () => {
    const { owner } = await ownerWithCustomers(1);
    const { ctx, provider } = await context(owner);
    for (let i = 0; i < 3; i++) expect((await runSend(ctx, request(ctx))).ok).toBe(true);
    const fourth = await runSend(ctx, request(ctx));
    expect(fourth.ok).toBe(false);
    expect(!fourth.ok && fourth.message).toMatch(/3 rain days today/);
    expect(provider.sent).toHaveLength(3);
  });

  it('refuses a text that is too long once names are filled in, before anything is saved', async () => {
    const owner = await signedIn();
    await service
      .schema('rain_day')
      .from('customers')
      .insert({ owner_id: owner.id, name: 'N'.repeat(100), phone: freshPhone(), service_day: 2 });
    const { ctx, provider } = await context(owner);
    const long = Array.from({ length: 40 }, () => '{first_name}').join(' ');
    const result = await runSend(ctx, request(ctx, undefined, long));
    expect(result.ok).toBe(false);
    expect(provider.sent).toHaveLength(0);
    const { data } = await owner.client.schema('rain_day').from('reschedules').select('id');
    expect(data).toHaveLength(0);
  });
});
