import type { Database } from '@speedy/db/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { guardPractice } from '../../src/features/practice/practice-guard';
import {
  clearPractice,
  markPracticeCall,
  sendPracticeReply,
  simulateMissedCall,
} from '../../src/features/practice/practice-flow';
import { readPractice } from '../../src/features/practice/practice-state';
import { supabasePracticeStore } from '../../src/features/practice/practice-store';
import { getMyLine } from '../../src/features/setup/line-queries';

/**
 * Practice mode against the real tables and functions on the local Supabase stack (DB_TESTS=1):
 * owner scoping, no leakage into the real tables, the hourly limit, and the switch-off once a real
 * number is set. No provider is involved at all.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(process.env.DB_TESTS && url && anonKey && serviceKey);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(url ?? 'http://127.0.0.1', serviceKey ?? 'x', opts);
const password = `pw-${crypto.randomUUID()}`;
const tag = Date.now();
const prod = { smsProvider: 'twilio', nodeEnv: 'production' };

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

const deps = async (owner: Owner) => {
  const guarded = guardPractice(await getMyLine(owner.db), prod);
  if (!guarded.ok) throw new Error(guarded.message);
  return { store: supabasePracticeStore(admin, owner.id), line: guarded.line };
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

describe.skipIf(!enabled)('practice mode against the database', () => {
  it('runs the whole flow and each owner sees only their own practice', async () => {
    const d = await deps(a);
    expect((await simulateMissedCall(d, '+12395550123')).ok).toBe(true);
    const view = await readPractice(a.db);
    expect(view.calls).toHaveLength(1);
    expect(view.calls[0]).toMatchObject({ callerNumber: '+12395550123', status: 'texted' });
    expect(view.messages.map((m) => m.direction)).toEqual(['out']);
    expect(view.messages[0]?.body).toContain('Sorry we missed you. What do you need?');

    await sendPracticeReply(d, view.calls[0]!.id, 'leaking water heater, garage');
    const after = await readPractice(a.db);
    expect(after.calls[0]?.status).toBe('replied');
    expect(after.messages.map((m) => m.direction)).toEqual(['out', 'in', 'forward']);
    expect(after.messages.at(-1)?.body).toBe(
      'New lead from (239) 555-0123: leaking water heater, garage',
    );

    expect((await readPractice(b.db)).calls).toEqual([]);
    expect((await readPractice(b.db)).messages).toEqual([]);
  });

  it('owner B cannot see, change or clear owner A practice, and cannot write practice rows', async () => {
    const callId = (await readPractice(a.db)).calls[0]!.id;
    const db = b.db.schema('missed_call');
    expect((await db.from('practice_calls').select('id').eq('id', callId)).data).toEqual([]);
    const forged = await db
      .from('practice_calls')
      .insert({ owner_id: b.id, caller_number: '+12395550150' });
    expect(forged.error).not.toBeNull();
    const edit = await db.from('practice_calls').update({ status: 'junk' }).eq('id', callId);
    expect(edit.error).not.toBeNull();
    // B's own store cannot reach A's call either, by id.
    const dB = await deps(b);
    const r = await markPracticeCall(dB, callId, 'junk');
    expect(!r.ok && r.code).toBe('not_found');
    expect((await readPractice(a.db)).calls[0]?.status).toBe('replied');
  });

  it('practice leaves the real tables alone', async () => {
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
    const callerRows = await admin
      .schema('missed_call')
      .from('calls')
      .select('id')
      .eq('caller_number', '+12395550123');
    expect(callerRows.data).toEqual([]);
  });

  it('Junk in practice stops practice texts to that number, like the real thing', async () => {
    const d = await deps(a);
    const id = (await readPractice(a.db)).calls[0]!.id;
    await markPracticeCall(d, id, 'junk');
    const r = await simulateMissedCall(d, '+12395550123');
    expect(r.ok && r.note).toMatch(/Junk/);
    const out = (await readPractice(a.db)).messages.filter((m) => m.direction === 'out');
    expect(out).toHaveLength(1);
  });

  it('stops at the hourly limit', async () => {
    const d = await deps(b);
    let refused = false;
    for (let i = 0; i < 61 && !refused; i += 1) {
      const r = await simulateMissedCall(d, `+12395550${String(101 + (i % 90)).padStart(3, '0')}`);
      if (!r.ok) {
        expect(r.code).toMatch(/rate_limited|full/);
        refused = true;
      }
    }
    expect(refused).toBe(true);
    expect((await clearPractice(d)).ok).toBe(true);
    expect((await readPractice(b.db)).calls).toEqual([]);
  });

  it('is refused once a real number and Messaging Service are set on the line', async () => {
    expect(guardPractice(await getMyLine(a.db), prod).ok).toBe(true);
    const set = await admin
      .schema('missed_call')
      .from('lines')
      .update({
        provider_number: `+1239570${String(tag).slice(-4)}`,
        provider_messaging_service_sid: 'MG' + 'c'.repeat(32),
      })
      .eq('id', a.lineId);
    expect(set.error).toBeNull();
    const after = guardPractice(await getMyLine(a.db), prod);
    expect(after.ok).toBe(false);
    expect(!after.ok && after.message).toMatch(/practice is switched off/);
  });
});
