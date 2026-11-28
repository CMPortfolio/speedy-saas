import type { Database } from '@speedy/db/types';
import { fakeProvider } from '@speedy/sms/fake';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createOwnerCellVerifier } from '../../src/features/setup/cell-verifier';
import { createLineAccess, createVerifyStore } from '../../src/features/setup/verify-store';

/**
 * Confirming the owner's cell with the real tables and functions, against the local Supabase
 * stack (DB_TESTS=1). The provider is the fake one: nothing leaves the machine.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(process.env.DB_TESTS && url && anonKey && serviceKey);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(url ?? 'http://127.0.0.1', serviceKey ?? 'x', opts);
const password = `pw-${crypto.randomUUID()}`;
const suffix = String(Math.floor(Math.random() * 9000) + 1000);
const CELL = `+1239562${suffix}`;
const OTHER_CELL = `+1239563${suffix}`;

let userId = '';
let owner: SupabaseClient<Database>;
const sms = fakeProvider();

const verifier = () =>
  createOwnerCellVerifier({
    provider: sms,
    store: createVerifyStore(admin),
    ...createLineAccess(admin),
  });
const lastCode = () => /\b(\d{6})\b/.exec(sms.sent.at(-1)?.body ?? '')?.[1] ?? '';
const isVerified = async () =>
  (
    await admin
      .schema('missed_call')
      .from('lines')
      .select('owner_cell_verified')
      .eq('owner_id', userId)
      .single()
  ).data?.owner_cell_verified;

beforeAll(async () => {
  if (!enabled) return;
  const email = `cell-${suffix}-${Date.now()}@resend.dev`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  userId = created.data.user?.id ?? '';
  const line = await admin
    .schema('missed_call')
    .from('lines')
    .insert({
      owner_id: userId,
      provider_number: `+1239564${suffix}`,
      owner_cell: CELL,
      business_name: 'Gulf Coast Plumbing',
      template: 'hi',
    });
  expect(line.error).toBeNull();
  owner = createClient<Database>(url ?? '', anonKey ?? '', opts);
  expect((await owner.auth.signInWithPassword({ email, password })).error).toBeNull();
});
afterAll(async () => {
  if (enabled && userId) await admin.auth.admin.deleteUser(userId);
});

describe.skipIf(!enabled)('owner cell confirmation against the database', () => {
  it('a wrong code does not confirm, the right one does, and the code works once', async () => {
    expect((await verifier().start(userId)).ok).toBe(true);
    expect(sms.sent.at(-1)?.to).toBe(CELL);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await verifier().confirm(userId, wrong);
    expect(bad).toMatchObject({
      ok: false,
      code: 'wrong',
      message: 'That code is not right. 4 tries left.',
    });
    expect(await isVerified()).toBe(false);
    expect((await verifier().confirm(userId, code)).ok).toBe(true);
    expect(await isVerified()).toBe(true);
    const again = await verifier().confirm(userId, code);
    expect(again).toMatchObject({ ok: false, code: 'none' });
  });

  it('owners cannot read their challenge or reset the attempts through the API', async () => {
    const read = await owner.schema('missed_call').from('cell_verifications').select('code_hash');
    expect(read.error).not.toBeNull();
    const sends = await owner.schema('missed_call').from('cell_verification_sends').select('id');
    expect(sends.error).not.toBeNull();
    const direct = await owner
      .schema('missed_call')
      .from('lines')
      .update({ owner_cell_verified: true })
      .eq('owner_id', userId);
    expect(direct.error).not.toBeNull();
  });

  it('changing the cell un-confirms it, and a code sent to the old cell confirms nothing', async () => {
    const lines = admin.schema('missed_call').from('lines');
    await lines.update({ owner_cell: CELL }).eq('owner_id', userId);
    const reset = await owner
      .schema('missed_call')
      .from('lines')
      .update({ owner_cell: OTHER_CELL })
      .eq('owner_id', userId);
    expect(reset.error).toBeNull();
    expect(await isVerified()).toBe(false);

    await owner
      .schema('missed_call')
      .from('lines')
      .update({ owner_cell: CELL })
      .eq('owner_id', userId);
    expect((await verifier().start(userId)).ok).toBe(true);
    const code = lastCode();
    await owner
      .schema('missed_call')
      .from('lines')
      .update({ owner_cell: OTHER_CELL })
      .eq('owner_id', userId);
    const r = await verifier().confirm(userId, code);
    expect(r).toMatchObject({ ok: false, code: 'cell_changed' });
    expect(await isVerified()).toBe(false);
  });

  it('allows three codes an hour per owner', async () => {
    await admin
      .schema('missed_call')
      .from('cell_verification_sends')
      .delete()
      .eq('owner_id', userId);
    await admin
      .schema('missed_call')
      .from('lines')
      .update({ owner_cell: CELL })
      .eq('owner_id', userId);
    for (let i = 0; i < 3; i += 1) expect((await verifier().start(userId)).ok).toBe(true);
    expect(await verifier().start(userId)).toMatchObject({ ok: false, code: 'rate_limited' });
  });
});
