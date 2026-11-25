import { fakeProvider } from '@speedy/sms/fake';
import type { CallStatusEvent } from '@speedy/sms/provider';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { supabaseStore } from '../../src/features/missed-calls/store';
import { handleVoiceWebhook } from '../../src/features/missed-calls/voice-webhook';

import { toRequest } from './signed-request';

/**
 * End to end through the real store against the local Supabase stack (DB_TESTS=1, with
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment). Uses the fake
 * SMS provider: nothing leaves the machine.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(process.env.DB_TESTS && url && serviceKey);

const suffix = String(Math.floor(Math.random() * 9000) + 1000);
const LINE_NUMBER = `+1239557${suffix}`;
const CALLER = `+1239558${suffix}`;

const admin = createClient(url ?? 'http://127.0.0.1', serviceKey ?? 'x', {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = admin.schema('missed_call');
const sms = fakeProvider();
let lineId = '';
let userId = '';
let sid = 0;

const post = async (
  from = CALLER,
  status: CallStatusEvent['status'] = 'ringing',
  callSid?: string,
) => {
  const signed = sms.inbound({
    kind: 'call',
    callSid: callSid ?? `CA-it-${suffix}-${(sid += 1)}`,
    from: from as CallStatusEvent['from'],
    to: LINE_NUMBER as CallStatusEvent['to'],
    status,
    direction: 'inbound',
  });
  const startedAt = Date.now();
  const started = performance.now();
  const res = await handleVoiceWebhook(toRequest(signed), {
    provider: sms,
    getStore: () => supabaseStore(admin),
  });
  return { res, ms: performance.now() - started, startedAt };
};

beforeAll(async () => {
  if (!enabled) return;
  const created = await admin.auth.admin.createUser({
    email: `mc-${suffix}-${Date.now()}@resend.dev`,
    email_confirm: true,
  });
  userId = created.data.user?.id ?? '';
  const line = await db
    .from('lines')
    .insert({
      owner_id: userId,
      provider_number: LINE_NUMBER,
      owner_cell: '+12395550101',
      business_name: 'Gulf Coast Plumbing',
      template: 'Sorry we missed your call. What do you need?',
      after_hours_template: 'We are closed. We will call you first thing.',
      quiet_hours: null,
    })
    .select('id')
    .single();
  lineId = line.data?.id ?? '';
  expect(lineId).not.toBe('');
});

afterAll(async () => {
  if (lineId) await db.from('lines').delete().eq('id', lineId);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe.skipIf(!enabled)('missed-call webhook against local Supabase', () => {
  it('logs the call, texts inside the webhook and records the message; measures the time', async () => {
    const { res, ms, startedAt } = await post();
    expect(res.status).toBe(200);
    expect(sms.sent).toHaveLength(1);
    const toSend = sms.sent[0]!.sentAt.getTime() - startedAt;
    process.stdout.write(
      `[measure] webhook to send ${toSend} ms, full webhook (signature, DB log, send, DB record) ${Math.round(ms)} ms\n`,
    );
    expect(ms).toBeLessThan(2000);

    const calls = await db.from('calls').select('id, status, caller_number').eq('line_id', lineId);
    expect(calls.data).toHaveLength(1);
    expect(calls.data?.[0]).toMatchObject({ status: 'texted', caller_number: CALLER });
    const msgs = await db
      .from('messages')
      .select('direction, body')
      .eq('call_id', calls.data![0]!.id);
    expect(msgs.data).toHaveLength(1);
    expect(msgs.data?.[0]?.direction).toBe('out');
    expect(msgs.data?.[0]?.body).toContain('What do you need?');
  });

  it('does not text the same caller again, and ignores a retried webhook', async () => {
    const sent = sms.sent.length;
    await post(CALLER, 'ringing');
    const retry = await post(CALLER, 'no-answer', `CA-it-${suffix}-1`);
    expect(retry.res.status).toBe(200);
    expect(sms.sent).toHaveLength(sent);
    const calls = await db.from('calls').select('status').eq('line_id', lineId);
    expect(calls.data).toHaveLength(2);
  });
});

describe.skipIf(!enabled)('missed-call webhook blocking and signatures', () => {
  it('never texts a blocked number', async () => {
    const blocked = `+1239559${suffix}`;
    await db.from('blocked_numbers').insert({ line_id: lineId, number: blocked, reason: 'junk' });
    const sent = sms.sent.length;
    const { res } = await post(blocked);
    expect(res.status).toBe(200);
    expect(sms.sent).toHaveLength(sent);
    const calls = await db.from('calls').select('status').eq('caller_number', blocked);
    expect(calls.data).toEqual([{ status: 'missed' }]);
  });

  it('answers a bad signature with 403 and writes nothing', async () => {
    const signed = sms.inbound({
      kind: 'call',
      callSid: `CA-forged-${suffix}`,
      from: '+12395550666',
      to: LINE_NUMBER as CallStatusEvent['to'],
      status: 'ringing',
      direction: 'inbound',
    });
    const res = await handleVoiceWebhook(toRequest({ ...signed, headers: {} }), {
      provider: sms,
      getStore: () => supabaseStore(admin),
    });
    expect(res.status).toBe(403);
    const calls = await db
      .from('calls')
      .select('id')
      .eq('provider_call_sid', `CA-forged-${suffix}`);
    expect(calls.data).toEqual([]);
  });

  it('two simultaneous webhooks from one caller text once', async () => {
    const caller = `+1239550${suffix}`;
    const before = sms.sent.length;
    await Promise.all([post(caller), post(caller), post(caller)]);
    expect(sms.sent).toHaveLength(before + 1);
  });
});

describe.skipIf(!enabled)('the line Messaging Service', () => {
  it('texts from the line number through the Messaging Service stored on the line', async () => {
    const service = 'MG' + 'c'.repeat(32);
    const set = await db
      .from('lines')
      .update({ provider_messaging_service_sid: service })
      .eq('id', lineId);
    expect(set.error).toBeNull();
    const before = sms.sent.length;
    const { res } = await post(`+1239566${suffix}`);
    expect(res.status).toBe(200);
    expect(sms.sent).toHaveLength(before + 1);
    expect(sms.sent.at(-1)).toMatchObject({ from: LINE_NUMBER, messagingServiceSid: service });
    await db.from('lines').update({ provider_messaging_service_sid: null }).eq('id', lineId);
    const { res: res2 } = await post(`+1239567${suffix}`);
    expect(res2.status).toBe(200);
    expect(sms.sent.at(-1)).not.toHaveProperty('messagingServiceSid');
  });
});
