import type { Database } from '@speedy/db/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The real practice server actions, called as one owner with another owner's ids. The auth layer is
 * replaced by real Supabase clients for the signed-in owner (so RLS and the service role behave as
 * in production); the action code itself is not mocked. Needs DB_TESTS=1 and the Supabase env vars.
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
const state = vi.hoisted(() => ({ current: null as null | { id: string; client: unknown } }));

vi.mock('@speedy/auth/user', () => ({
  requireUser: async () => {
    if (!state.current) throw new Error('not signed in');
    return { id: state.current.id };
  },
}));
vi.mock('@speedy/auth/server', () => ({
  createServerSupabase: async () => state.current!.client,
  createServiceSupabase: () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

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
  await service
    .from('profiles')
    .update({ business_name: 'Green Gulf Lawn' })
    .eq('id', made.data.user.id);
  return { id: made.data.user.id, client };
}

async function ownerWithCustomers(count: number) {
  const owner = await signedIn();
  const { error } = await service
    .schema('rain_day')
    .from('customers')
    .insert(
      Array.from({ length: count }, (_, i) => ({
        owner_id: owner.id,
        name: `Customer${i} Test`,
        phone: `+12398${String(i).padStart(6, '0')}`,
        service_day: 2,
      })),
    );
  if (error) throw error;
  const { data } = await owner.client
    .schema('rain_day')
    .from('customers')
    .select('*')
    .order('name');
  return { owner, customers: data! };
}

const as = (owner: Owner) => {
  state.current = owner;
};

const day = () => {
  // A Tuesday at least a week out, so "today or later" always holds.
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  const from = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 1);
  return { from, to: d.toISOString().slice(0, 10) };
};

beforeAll(() => {
  if (enabled)
    service = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
});

afterAll(async () => {
  if (enabled) for (const id of created) await service.auth.admin.deleteUser(id);
});

describe.skipIf(!enabled)(
  'practice server actions: another owner’s ids',
  { timeout: 60_000 },
  () => {
    it('sendPracticeRainDay with the other owner’s customer ids sends nothing and writes nothing for them', async () => {
      const { sendPracticeRainDay } = await import('@/features/practice/actions');
      const mine = await ownerWithCustomers(2);
      const theirs = await ownerWithCustomers(2);
      as(mine.owner);
      const dates = day();
      const result = await sendPracticeRainDay({
        idempotencyKey: crypto.randomUUID(),
        ...dates,
        template: 'Hi {first_name}, moving you to {new_day}.',
        customerIds: theirs.customers.map((c) => c.id),
      });
      expect(result).toEqual({ ok: false, message: 'Tick at least one customer.' });
      for (const owner of [mine.owner, theirs.owner]) {
        const { count } = await service
          .schema('rain_day')
          .from('practice_reschedules')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', owner.id);
        expect(count).toBe(0);
      }
    });

    it('sendPracticeReply with another owner’s customer or practice rain day is refused', async () => {
      const { sendPracticeRainDay, sendPracticeReply } =
        await import('@/features/practice/actions');
      const mine = await ownerWithCustomers(2);
      const theirs = await ownerWithCustomers(2);
      const dates = day();
      const send = async (owner: { owner: Owner; customers: { id: string }[] }) => {
        as(owner.owner);
        const sent = await sendPracticeRainDay({
          idempotencyKey: crypto.randomUUID(),
          ...dates,
          template: 'Hi {first_name}, moving you to {new_day}.',
          customerIds: owner.customers.map((c) => c.id),
        });
        if (!sent.ok) throw new Error(sent.message);
        return sent.rescheduleId;
      };
      const mineDay = await send(mine);
      const theirDay = await send(theirs);

      as(mine.owner);
      const attempts: [string, string][] = [
        [theirs.customers[0]!.id, mineDay], // their customer in my practice rain day
        [mine.customers[0]!.id, theirDay], // my customer in their practice rain day
        [theirs.customers[0]!.id, theirDay], // both theirs
      ];
      for (const [customerId, rescheduleId] of attempts) {
        const result = await sendPracticeReply({ rescheduleId, customerId, body: 'hi' });
        expect(result.ok).toBe(false);
      }
      // Their own reply, as themselves, works: the refusals above were about ownership.
      as(mine.owner);
      expect(
        (
          await sendPracticeReply({
            rescheduleId: mineDay,
            customerId: mine.customers[0]!.id,
            body: 'hi',
          })
        ).ok,
      ).toBe(true);
      // And nothing was written into the other owner's practice phone.
      const { count } = await service
        .schema('rain_day')
        .from('practice_messages')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', theirs.owner.id)
        .eq('direction', 'in');
      expect(count).toBe(0);
    });

    it('malformed ids and an empty reply are rejected before anything runs', async () => {
      const { sendPracticeReply } = await import('@/features/practice/actions');
      const mine = await ownerWithCustomers(1);
      as(mine.owner);
      for (const input of [
        { rescheduleId: 'nope', customerId: mine.customers[0]!.id, body: 'hi' },
        { rescheduleId: crypto.randomUUID(), customerId: 'nope', body: 'hi' },
        { rescheduleId: crypto.randomUUID(), customerId: mine.customers[0]!.id, body: '   ' },
        {
          rescheduleId: crypto.randomUUID(),
          customerId: mine.customers[0]!.id,
          body: 'x'.repeat(1601),
        },
      ]) {
        expect((await sendPracticeReply(input)).ok).toBe(false);
      }
    });

    it('an owner with a texting number is refused by the real actions', async () => {
      const { sendPracticeRainDay, sendPracticeReply } =
        await import('@/features/practice/actions');
      const mine = await ownerWithCustomers(1);
      await service
        .schema('rain_day')
        .from('owner_settings')
        .upsert(
          { owner_id: mine.owner.id, sender_number: '+12397123456' },
          { onConflict: 'owner_id' },
        );
      as(mine.owner);
      const dates = day();
      const sent = await sendPracticeRainDay({
        idempotencyKey: crypto.randomUUID(),
        ...dates,
        template: 'Hi {first_name}, moving you to {new_day}.',
        customerIds: mine.customers.map((c) => c.id),
      });
      expect(sent).toEqual({
        ok: false,
        message: 'Practice is only for owners whose texting number is not set up yet.',
      });
      const reply = await sendPracticeReply({
        rescheduleId: crypto.randomUUID(),
        customerId: mine.customers[0]!.id,
        body: 'hi',
      });
      expect(reply.ok).toBe(false);
    });
  },
);
