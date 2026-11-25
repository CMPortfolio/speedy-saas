import type { Database } from '@speedy/db/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// If anything the practice actions load tried to load or build a Twilio client, or the real SMS
// provider setup, these would throw and every test below would fail.
vi.mock('twilio', () => {
  throw new Error('practice mode must never load the Twilio SDK');
});
vi.mock('@/config/sms', () => {
  throw new Error('practice mode must never use the real SMS provider');
});

const session = vi.hoisted(() => ({
  userId: '',
  owner: undefined as unknown,
  service: undefined as unknown,
}));
vi.mock('@speedy/auth/server', () => ({
  createServerSupabase: async () => session.owner,
  createServiceSupabase: () => session.service,
}));
vi.mock('@speedy/auth/user', () => ({ requireUser: async () => ({ id: session.userId }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  practiceCall,
  practiceClear,
  practiceMark,
  practiceReply,
} from '../../src/features/practice/practice-actions';
import { readPractice } from '../../src/features/practice/practice-state';

/**
 * Practice mode through the real server actions against the local Supabase stack (DB_TESTS=1): the
 * owner comes only from the session, every id is checked against that owner, practice is refused
 * the moment the line has a number, and no provider is involved at all.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(process.env.DB_TESTS && url && anonKey && serviceKey);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(url ?? 'http://127.0.0.1', serviceKey ?? 'x', opts);
const password = `pw-${crypto.randomUUID()}`;
const tag = Date.now();

interface Owner {
  id: string;
  db: SupabaseClient<Database>;
  lineId: string;
}
let a: Owner;
let b: Owner;

async function makeOwner(name: string): Promise<Owner> {
  const email = `practice-${name}-${tag}@resend.dev`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const id = created.data.user?.id ?? '';
  const line = await admin
    .schema('missed_call')
    .from('lines')
    .insert({
      owner_id: id,
      owner_cell: '+12395550101',
      business_name: `Practice ${name}`,
      template: 'Sorry we missed you. What do you need?',
    })
    .select('id')
    .single();
  const db = createClient<Database>(url ?? '', anonKey ?? '', opts);
  expect((await db.auth.signInWithPassword({ email, password })).error).toBeNull();
  return { id, db, lineId: line.data?.id ?? '' };
}

/** Act as this owner: the session the actions read. */
const as = (o: Owner) => {
  session.userId = o.id;
  session.owner = o.db;
  session.service = admin;
};

beforeAll(async () => {
  if (!enabled) return;
  a = await makeOwner('a');
  b = await makeOwner('b');
});
afterAll(async () => {
  if (!enabled) return;
  for (const o of [a, b]) if (o?.id) await admin.auth.admin.deleteUser(o.id);
});

describe.skipIf(!enabled)('practice mode through the server actions', () => {
  it('runs the whole flow, with the caller chosen on the server and each owner seeing only their own', async () => {
    as(a);
    const r = await practiceCall();
    expect(r.ok && r.note).toMatch(/The caller got your text/);
    const view = await readPractice(a.db);
    expect(view.calls).toHaveLength(1);
    expect(view.calls[0]?.callerNumber).toMatch(/^\+12395550(1[0-9]{2})$/);
    expect(view.calls[0]?.status).toBe('texted');
    expect(view.messages[0]?.body).toContain('Sorry we missed you. What do you need?');

    const reply = await practiceReply(view.calls[0]!.id, 'leaking water heater, garage');
    expect(reply.ok).toBe(true);
    const after = await readPractice(a.db);
    expect(after.calls[0]?.status).toBe('replied');
    expect(after.messages.map((m) => m.direction)).toEqual(['out', 'in', 'forward']);
    expect(after.messages.at(-1)?.body).toMatch(
      /^New lead from \(239\) 555-01\d\d: leaking water heater, garage$/,
    );

    expect((await readPractice(b.db)).calls).toEqual([]);
    expect((await readPractice(b.db)).messages).toEqual([]);
  });

  it('owner B cannot touch owner A practice by id, and A is left exactly as it was', async () => {
    const view = await readPractice(a.db);
    const callId = view.calls[0]!.id;
    as(b);
    for (const result of [
      await practiceReply(callId, 'hijack'),
      await practiceMark(callId, 'junk'),
      await practiceCall(callId),
    ]) {
      expect(result.ok).toBe(false);
    }
    // A made-up id is refused too, not a crash.
    expect((await practiceMark('not-a-real-id', 'junk')).ok).toBe(false);
    expect(await readPractice(a.db)).toEqual(view);
    expect((await readPractice(b.db)).calls).toEqual([]);

    // B cannot write practice rows straight through the API either.
    const forged = await b.db
      .schema('missed_call')
      .from('practice_messages')
      .insert({ owner_id: b.id, call_id: callId, direction: 'in', body: 'x' });
    expect(forged.error).not.toBeNull();
    const clear = await practiceClear();
    expect(clear.ok).toBe(true);
    as(a);
    expect((await readPractice(a.db)).calls).toHaveLength(1);
  });

  it('repeats the same caller by id, inside the 24 hour rule, and Junk stops texts to it', async () => {
    as(a);
    const first = (await readPractice(a.db)).calls[0]!;
    const again = await practiceCall(first.id);
    expect(again.ok && again.note).toMatch(/24 hours/);
    expect((await practiceMark(first.id, 'junk')).ok).toBe(true);
    const junk = await practiceCall(first.id);
    expect(junk.ok && junk.note).toMatch(/Junk/);
    const out = (await readPractice(a.db)).messages.filter((m) => m.direction === 'out');
    expect(out).toHaveLength(1);
  });

  it('never touches the real tables or the real opt-out and verified state', async () => {
    const calls = await admin
      .schema('missed_call')
      .from('calls')
      .select('id')
      .eq('line_id', a.lineId);
    expect(calls.data).toEqual([]);
    const blocked = await admin
      .schema('missed_call')
      .from('blocked_numbers')
      .select('id')
      .eq('line_id', a.lineId);
    expect(blocked.data).toEqual([]);
    const line = await admin
      .schema('missed_call')
      .from('lines')
      .select('owner_cell_verified')
      .eq('id', a.lineId)
      .single();
    expect(line.data?.owner_cell_verified).toBe(false);
  });

  it('hides practice older than a week and deletes it the next time the owner practices', async () => {
    as(b);
    const old = await admin
      .schema('missed_call')
      .from('practice_calls')
      .insert({
        owner_id: b.id,
        caller_number: '+12395550177',
        received_at: new Date(Date.now() - 8 * 24 * 3600_000).toISOString(),
      })
      .select('id')
      .single();
    expect(old.error).toBeNull();
    expect((await readPractice(b.db)).calls).toEqual([]);
    await practiceClear();
    const stale = await admin
      .schema('missed_call')
      .from('practice_calls')
      .insert({
        owner_id: b.id,
        caller_number: '+12395550178',
        received_at: new Date(Date.now() - 9 * 24 * 3600_000).toISOString(),
      })
      .select('id')
      .single();
    expect((await practiceCall()).ok).toBe(true);
    const left = await admin
      .schema('missed_call')
      .from('practice_calls')
      .select('id')
      .eq('id', stale.data?.id ?? '');
    expect(left.data).toEqual([]);
    await practiceClear();
  });
});

describe.skipIf(!enabled)('practice limits, expiry and switch-off', () => {
  it('stops at the hourly limit and clear always works', async () => {
    as(b);
    let refused = false;
    for (let i = 0; i < 62 && !refused; i += 1) {
      const r = await practiceCall();
      if (!r.ok) refused = true;
    }
    expect(refused).toBe(true);
    expect((await practiceClear()).ok).toBe(true);
    expect((await readPractice(b.db)).calls).toEqual([]);
  });

  it('is refused as soon as the line has any number, even before the Messaging Service', async () => {
    as(a);
    const set = await admin
      .schema('missed_call')
      .from('lines')
      .update({ provider_number: `+1239570${String(tag).slice(-4)}` })
      .eq('id', a.lineId);
    expect(set.error).toBeNull();
    const id = (await readPractice(a.db)).calls[0]!.id;
    for (const r of [
      await practiceCall(),
      await practiceCall(id),
      await practiceReply(id, 'hi'),
      await practiceMark(id, 'booked'),
      await practiceClear(),
    ]) {
      expect(!r.ok && r.message).toMatch(/practice is switched off/);
    }
    expect((await readPractice(a.db)).calls).toHaveLength(3);
  });
});
