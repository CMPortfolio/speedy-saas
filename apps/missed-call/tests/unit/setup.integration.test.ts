import type { Database } from '@speedy/db/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getMyLine } from '../../src/features/setup/line-queries';
import { runSaveSetup } from '../../src/features/setup/save-setup';

/** The setup form's save, with real owner sessions, against the local Supabase stack (DB_TESTS=1). */
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
}
let one: Owner;
let two: Owner;

async function makeOwner(name: string): Promise<Owner> {
  const email = `setup-${name}-${tag}@resend.dev`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const db = createClient<Database>(url ?? '', anonKey ?? '', opts);
  expect((await db.auth.signInWithPassword({ email, password })).error).toBeNull();
  return { id: created.data.user?.id ?? '', db };
}

const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  const base: Record<string, string> = {
    businessName: 'Gulf Coast Plumbing',
    ownerCell: '(239) 555-0101',
    template: 'Sorry we missed your call. What do you need?',
    afterHoursTemplate: 'We are closed. We will call you first thing.',
    hours: 'set',
    opens: '08:00',
    closes: '17:00',
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) f.set(k, v);
  return f;
};

beforeAll(async () => {
  if (!enabled) return;
  one = await makeOwner('one');
  two = await makeOwner('two');
});
afterAll(async () => {
  if (!enabled) return;
  for (const o of [one, two]) if (o?.id) await admin.auth.admin.deleteUser(o.id);
});

describe.skipIf(!enabled)('setup save', () => {
  it('creates the owner line, unverified and with no number', async () => {
    expect(await getMyLine(one.db)).toBeNull();
    expect(await runSaveSetup(one.db, one.id, form())).toEqual({ status: 'saved' });
    const line = await getMyLine(one.db);
    expect(line).toMatchObject({
      businessName: 'Gulf Coast Plumbing',
      ownerCell: '+12395550101',
      ownerCellVerified: false,
      providerNumber: null,
      quietHours: { start: '17:00', end: '08:00' },
    });
  });

  it('updates the same line instead of making a second one', async () => {
    expect(await runSaveSetup(one.db, one.id, form({ template: 'New wording' }))).toEqual({
      status: 'saved',
    });
    const rows = await admin
      .schema('missed_call')
      .from('lines')
      .select('id')
      .eq('owner_id', one.id);
    expect(rows.data).toHaveLength(1);
    expect((await getMyLine(one.db))?.template).toBe('New wording');
  });

  it('writes nothing when the form is invalid', async () => {
    const state = await runSaveSetup(
      one.db,
      one.id,
      form({ ownerCell: 'nope', template: 'Kept?' }),
    );
    expect(state.status).toBe('invalid');
    expect((await getMyLine(one.db))?.template).toBe('New wording');
  });

  it('puts a changed cell back to unverified', async () => {
    const line = await getMyLine(one.db);
    await admin
      .schema('missed_call')
      .from('lines')
      .update({ owner_cell_verified: true })
      .eq('id', line!.id);
    expect((await getMyLine(one.db))?.ownerCellVerified).toBe(true);
    await runSaveSetup(one.db, one.id, form({ template: 'Same cell, new text' }));
    expect((await getMyLine(one.db))?.ownerCellVerified).toBe(true);
    await runSaveSetup(one.db, one.id, form({ ownerCell: '(239) 555-0188' }));
    expect((await getMyLine(one.db))?.ownerCellVerified).toBe(false);
  });

  it('another owner sees none of it and gets their own line', async () => {
    expect(await getMyLine(two.db)).toBeNull();
    await runSaveSetup(two.db, two.id, form({ businessName: 'Bay Electric' }));
    expect((await getMyLine(two.db))?.businessName).toBe('Bay Electric');
    expect((await getMyLine(one.db))?.businessName).toBe('Gulf Coast Plumbing');
  });
});
