import { FAKE_SIGNATURE, FAKE_SIGNATURE_HEADER } from '@speedy/sms/fake';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * The one moment, on a phone: an owner signs in, sets up, a call is missed, the caller's reply
 * lands in the list, and the owner marks the number Junk. The SMS provider is the fake one
 * (nothing is sent anywhere) and webhooks are posted the way the provider would, signed.
 *
 * Needs the local Supabase stack: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
 * environment (never in the repo).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const digits = String(Math.floor(Math.random() * 9000) + 1000);
const LINE_NUMBER = `+1239560${digits}`;
const CALLER = `+1239561${digits}`;
const CALLER_SHOWN = `(239) 561-${digits}`;
const email = `e2e-${Date.now()}-${digits}@resend.dev`;

const admin = createClient(url ?? 'http://127.0.0.1', serviceKey ?? 'x', {
  auth: { persistSession: false, autoRefreshToken: false },
});
let userId = '';

async function webhook(request: APIRequestContext, path: string, event: object) {
  return request.post(path, {
    headers: { [FAKE_SIGNATURE_HEADER]: FAKE_SIGNATURE, 'content-type': 'application/json' },
    data: JSON.stringify(event),
  });
}

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

test('set up, miss a call, see the reply, mark it junk', async ({ page, request }) => {
  test.skip(!url || !serviceKey, 'needs the local Supabase stack in the environment');

  // Sign in with a magic link made by the admin API (no email is sent).
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  userId = created.data.user?.id ?? '';
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const hashed = link.data.properties?.hashed_token ?? '';
  expect(hashed).not.toBe('');
  await page.goto(`/auth/callback?token_hash=${hashed}&type=magiclink&next=/setup`);
  await expect(page).toHaveURL(/\/setup$/);

  // Setup: the preview follows what is typed.
  await page.getByLabel('Business name').fill('Gulf Coast Plumbing');
  await page.getByLabel('Your cell number').fill('(239) 555-0101');
  const preview = page.getByTestId('preview-text').first();
  await expect(preview).toContainText('Hi, this is Gulf Coast Plumbing.');
  await expect(preview).toContainText('Reply STOP to opt out.');
  await page
    .getByLabel('Text callers get when you miss them')
    .fill('Sorry we missed you. What do you need?');
  await expect(preview).toContainText('Sorry we missed you. What do you need?');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByTestId('setup-saved')).toBeVisible();
  await expect(page.getByTestId('number-pending')).toBeVisible();
  await expect(page.getByTestId('cell-unconfirmed')).toBeVisible();

  // An admin assigns the number (v1) and, here, stands in for the cell confirmation step.
  const assigned = await admin
    .schema('missed_call')
    .from('lines')
    .update({ provider_number: LINE_NUMBER, owner_cell_verified: true })
    .eq('owner_id', userId);
  expect(assigned.error).toBeNull();
  await page.reload();
  await expect(page.getByTestId('provider-number')).toBeVisible();
  await expect(page.getByTestId('carrier-verizon').getByTestId('activate-code')).toHaveText(
    `*71${LINE_NUMBER.slice(2)}`,
  );
  await expect(page.getByTestId('carrier-tmobile')).toContainText('Check with a test call');

  // A call is missed: logged, texted back, answered with TwiML.
  const call = await webhook(request, '/api/voice/incoming', {
    kind: 'call',
    callSid: `CA-e2e-${digits}`,
    from: CALLER,
    to: LINE_NUMBER,
    status: 'ringing',
    direction: 'inbound',
  });
  expect(call.status()).toBe(200);
  expect(await call.text()).toContain('<Say>');

  // The caller replies.
  const reply = await webhook(request, '/api/sms/inbound', {
    kind: 'inbound',
    from: CALLER,
    to: LINE_NUMBER,
    body: 'leaking water heater, garage',
    providerMessageId: `SM-e2e-${digits}`,
  });
  expect(reply.status()).toBe(204);

  // The list shows it, newest first, with the reply and status.
  await page.goto('/calls');
  const row = page.getByTestId('call-row').first();
  await expect(row).toContainText(CALLER_SHOWN);
  await expect(row.getByTestId('call-reply')).toHaveText('leaking water heater, garage');
  await expect(row.getByTestId('call-status')).toHaveText('Replied');
  await expect(row.getByRole('link', { name: `Call back ${CALLER_SHOWN}` })).toHaveAttribute(
    'href',
    `tel:${CALLER}`,
  );
  await expect(row.getByRole('link', { name: `Reply to ${CALLER_SHOWN}` })).toHaveAttribute(
    'href',
    `sms:${CALLER}`,
  );

  // Junk it.
  await row.getByRole('button', { name: `Junk: ${CALLER_SHOWN}` }).click();
  await expect(row.getByTestId('call-status')).toHaveText('Junk');
  const blocked = await admin
    .schema('missed_call')
    .from('blocked_numbers')
    .select('reason')
    .eq('number', CALLER);
  expect(blocked.data).toEqual([{ reason: 'junk' }]);

  // The same number calling again is logged but never texted.
  const again = await webhook(request, '/api/voice/incoming', {
    kind: 'call',
    callSid: `CA-e2e-again-${digits}`,
    from: CALLER,
    to: LINE_NUMBER,
    status: 'ringing',
    direction: 'inbound',
  });
  expect(again.status()).toBe(200);
  await page.goto('/calls');
  await expect(page.getByTestId('call-row').first().getByTestId('call-status')).toHaveText(
    'Missed',
  );
});

test('a webhook without the provider signature is refused', async ({ request }) => {
  const res = await request.post('/api/voice/incoming', {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ kind: 'call' }),
  });
  expect(res.status()).toBe(403);
});
