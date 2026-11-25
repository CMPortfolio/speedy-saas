import type { Database } from '@speedy/db/types';
import { fakeProvider } from '@speedy/sms/fake';
import type { CallStatusEvent } from '@speedy/sms/provider';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listCalls, markCall } from '../../src/features/calls/queries';
import { handleInboundSmsWebhook } from '../../src/features/missed-calls/sms-webhook';
import { supabaseStore } from '../../src/features/missed-calls/store';
import { handleVoiceWebhook } from '../../src/features/missed-calls/voice-webhook';
import { toRequest } from './signed-request';

/**
 * Reply capture, the Missed calls list and Junk, against the local Supabase stack (DB_TESTS=1).
 * Owners use real sessions (anon key + password sign-in), so RLS is what is being tested.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(process.env.DB_TESTS && url && anonKey && serviceKey);

const n = String(Math.floor(Math.random() * 9000) + 1000);
const OWNER_CELL = '+12395550101';
const mkLine = (prefix: string) => `+1${prefix}${n}`;
const lineNumber = { a: mkLine('239557'), b: mkLine('239560') };
const callers = { one: mkLine('239558'), two: mkLine('239561') };
const password = `pw-${crypto.randomUUID()}`;

type Owner = { id: string; db: SupabaseClient<Database>; lineId: string };
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(url ?? 'http://127.0.0.1', serviceKey ?? 'x', opts);
const sms = fakeProvider();
let a: Owner;
let b: Owner;
let sid = 0;

async function makeOwner(tag: 'a' | 'b'): Promise<Owner> {
  const email = `mc-${tag}-${n}-${Date.now()}@resend.dev`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const id = created.data.user?.id ?? '';
  const line = await admin
    .schema('missed_call')
    .from('lines')
    .insert({
      owner_id: id,
      provider_number: lineNumber[tag],
      owner_cell: OWNER_CELL,
      owner_cell_verified: true,
      business_name: tag === 'a' ? 'Gulf Coast Plumbing' : 'Bay Electric',
      template: 'Sorry we missed your call. What do you need?',
    })
    .select('id')
    .single();
  const db = createClient<Database>(url ?? '', anonKey ?? '', opts);
  const signedIn = await db.auth.signInWithPassword({ email, password });
  expect(signedIn.error).toBeNull();
  return { id, db, lineId: line.data?.id ?? '' };
}

const store = () => supabaseStore(admin);
const miss = (to: string, from: string) => {
  const signed = sms.inbound({
    kind: 'call',
    callSid: `CA-m4-${n}-${(sid += 1)}`,
    from: from as CallStatusEvent['from'],
    to: to as CallStatusEvent['to'],
    status: 'ringing',
    direction: 'inbound',
  });
  return handleVoiceWebhook(toRequest(signed), { provider: sms, getStore: store });
};
const text = (to: string, from: string, body: string) => {
  const signed = sms.inbound({
    kind: 'inbound',
    from: from as CallStatusEvent['from'],
    to: to as CallStatusEvent['to'],
    body,
    providerMessageId: `SM-m4-${n}-${(sid += 1)}`,
  });
  return handleInboundSmsWebhook(toRequest(signed), { provider: sms, getStore: store });
};

beforeAll(async () => {
  if (!enabled) return;
  a = await makeOwner('a');
  b = await makeOwner('b');
});

afterAll(async () => {
  if (!enabled) return;
  for (const o of [a, b]) {
    if (o?.lineId) await admin.schema('missed_call').from('lines').delete().eq('id', o.lineId);
    if (o?.id) await admin.auth.admin.deleteUser(o.id);
  }
});

describe.skipIf(!enabled)('replies, the list and Junk', () => {
  it('captures a reply, marks the call replied and forwards it to the owner cell', async () => {
    await miss(lineNumber.a, callers.one);
    sms.sent.length = 0;
    const res = await text(lineNumber.a, callers.one, 'leaking water heater, garage');
    expect(res.status).toBe(204);
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]).toMatchObject({
      to: OWNER_CELL,
      body: `New lead from (239) 558-${n}: leaking water heater, garage`,
    });
    const rows = await listCalls(a.db);
    expect(rows[0]).toMatchObject({ status: 'replied', reply: 'leaking water heater, garage' });
  });

  it('lists calls newest first for the owner', async () => {
    await miss(lineNumber.a, callers.two);
    const rows = await listCalls(a.db);
    expect(rows.map((r) => r.callerNumber)).toEqual([callers.two, callers.one]);
  });

  it("owner A cannot see owner B's calls, and B cannot change A's", async () => {
    await miss(lineNumber.b, callers.one);
    const bRows = await listCalls(b.db);
    expect(bRows).toHaveLength(1);
    expect((await listCalls(a.db)).every((r) => r.id !== bRows[0]?.id)).toBe(true);
    const aRows = await listCalls(a.db);
    await expect(markCall(b.db, aRows[0]!.id, 'junk')).rejects.toThrow();
    expect((await listCalls(a.db))[0]?.status).not.toBe('junk');
  });

  it('Called back and Booked update the status', async () => {
    const rows = await listCalls(a.db);
    await markCall(a.db, rows[0]!.id, 'called_back');
    expect((await listCalls(a.db))[0]?.status).toBe('called_back');
    await markCall(a.db, rows[0]!.id, 'booked');
    expect((await listCalls(a.db))[0]?.status).toBe('booked');
  });

  it('Junk blocks the number: no more auto-texts and no forwarded replies', async () => {
    const rows = await listCalls(a.db);
    const target = rows.find((r) => r.callerNumber === callers.one)!;
    await markCall(a.db, target.id, 'junk');
    const blocked = await admin
      .schema('missed_call')
      .from('blocked_numbers')
      .select('reason')
      .eq('line_id', a.lineId)
      .eq('number', callers.one);
    expect(blocked.data).toEqual([{ reason: 'junk' }]);

    sms.sent.length = 0;
    // The 24 hour cooldown would also stop this text, so expire it to prove the block does.
    await admin
      .schema('missed_call')
      .from('calls')
      .update({ texted_at: new Date(Date.now() - 48 * 3600_000).toISOString() })
      .eq('line_id', a.lineId);
    expect((await miss(lineNumber.a, callers.one)).status).toBe(200);
    await text(lineNumber.a, callers.one, 'hello?');
    expect(sms.sent).toHaveLength(0);
    const again = await listCalls(a.db);
    expect(again.filter((r) => r.callerNumber === callers.one)[0]?.status).toBe('missed');
  });

  it('Junk is not shared across lines: the same number still reaches owner B', async () => {
    sms.sent.length = 0;
    await miss(lineNumber.b, `+1239559${n}`);
    expect(sms.sent).toHaveLength(1);
  });

  it('moving a call off Junk lifts the block', async () => {
    const target = (await listCalls(a.db)).find(
      (r) => r.callerNumber === callers.one && r.status === 'junk',
    )!;
    await markCall(a.db, target.id, 'called_back');
    const blocked = await admin
      .schema('missed_call')
      .from('blocked_numbers')
      .select('id')
      .eq('line_id', a.lineId)
      .eq('number', callers.one);
    expect(blocked.data).toEqual([]);
  });
});

describe.skipIf(!enabled)('STOP, HELP and direct updates', () => {
  it('a STOP after Junk survives un-junking: the number is still never texted', async () => {
    const target = (await listCalls(a.db)).find((r) => r.callerNumber === callers.two)!;
    await markCall(a.db, target.id, 'junk');
    await text(lineNumber.a, callers.two, 'STOP');
    const reasons = async () =>
      (
        await admin
          .schema('missed_call')
          .from('blocked_numbers')
          .select('reason')
          .eq('line_id', a.lineId)
          .eq('number', callers.two)
      ).data;
    expect(await reasons()).toEqual([{ reason: 'opted_out' }]);
    await markCall(a.db, target.id, 'called_back');
    expect(await reasons()).toEqual([{ reason: 'opted_out' }]);

    await admin
      .schema('missed_call')
      .from('calls')
      .update({ texted_at: new Date(Date.now() - 48 * 3600_000).toISOString() })
      .eq('line_id', a.lineId);
    sms.sent.length = 0;
    await miss(lineNumber.a, callers.two);
    expect(sms.sent).toHaveLength(0);
  });

  it('a caller who texted STOP can still reply to the owner, and START opts back in', async () => {
    sms.sent.length = 0;
    await text(lineNumber.a, callers.two, 'ok, tomorrow at 9 works');
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]?.to).toBe(OWNER_CELL);
    await text(lineNumber.a, callers.two, 'START');
    const left = await admin
      .schema('missed_call')
      .from('blocked_numbers')
      .select('id')
      .eq('line_id', a.lineId)
      .eq('number', callers.two);
    expect(left.data).toEqual([]);
  });

  it('answers HELP only to a number that called this line, once a day', async () => {
    sms.sent.length = 0;
    await text(lineNumber.a, `+1239559${n}`, 'HELP');
    expect(sms.sent).toHaveLength(0);
    await text(lineNumber.a, callers.two, 'HELP');
    await text(lineNumber.a, callers.two, 'help');
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]?.to).toBe(callers.two);
  });

  it('owners cannot set a call status with a direct update, only through mark_call', async () => {
    const row = (await listCalls(a.db))[0]!;
    const direct = await a.db
      .schema('missed_call')
      .from('calls')
      .update({ status: 'booked' })
      .eq('id', row.id);
    expect(direct.error).not.toBeNull();
  });
});
