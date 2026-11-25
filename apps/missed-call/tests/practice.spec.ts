import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Practice mode on a phone, on a production build with the real provider selected
 * (SMS_PROVIDER=twilio) and NO Twilio credentials, which is how a deployment looks before its
 * number exists. If practice worked by touching a provider, this would fail. Needs the local
 * Supabase stack in the environment.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const digits = String(Math.floor(Math.random() * 9000) + 1000);
const email = `practice-${Date.now()}-${digits}@resend.dev`;
const admin = createClient(url ?? 'http://127.0.0.1', serviceKey ?? 'x', {
  auth: { persistSession: false, autoRefreshToken: false },
});
let userId = '';

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

test('an owner with no number practices the whole flow, nothing is sent, and it switches off with a real number', async ({
  page,
  request,
}) => {
  if (!url || !serviceKey) {
    if (process.env.CI)
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    test.skip(true, 'needs the local Supabase stack in the environment');
  }
  // The proof that matters: no provider credentials exist anywhere in this run.
  expect(process.env.TWILIO_ACCOUNT_SID).toBeUndefined();
  expect(process.env.TWILIO_AUTH_TOKEN).toBeUndefined();

  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  userId = created.data.user?.id ?? '';
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  await page.goto(
    `/auth/callback?token_hash=${link.data.properties?.hashed_token ?? ''}&type=magiclink&next=/setup`,
  );
  await expect(page).toHaveURL(/\/setup$/);

  // Finish setup with no provider number at all.
  await page.getByLabel('Business name').fill('Gulf Coast Plumbing');
  await page.getByLabel('Your cell number').fill('(239) 555-0111');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByTestId('setup-saved')).toBeVisible();

  const panel = page.getByTestId('practice-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('practice-banner')).toContainText(
    "Practice mode — nothing is texted to anyone. Your real number isn't set up yet.",
  );

  // 1. A missed call: the caller's phone shows the template, with the business name and STOP line.
  await page.getByTestId('practice-call').click();
  const callerPhone = page.getByTestId('practice-caller-phone');
  await expect(callerPhone.getByTestId('phone-bubble').first()).toContainText(
    'Gulf Coast Plumbing',
  );
  await expect(callerPhone.getByTestId('phone-bubble').first()).toContainText(
    'Reply STOP to opt out.',
  );
  const row = page.getByTestId('practice-call-row').first();
  await expect(row.getByTestId('practice-status')).toHaveText('Texted back');
  await expect(page.getByTestId('practice-note')).toContainText('The caller got your text');

  // The same practice number calling again is inside the 24 hour rule: logged, no second text.
  await row.getByRole('button', { name: 'Calls again' }).click();
  await expect(page.getByTestId('practice-note')).toContainText('24 hours');
  await expect(page.getByTestId('practice-call-row')).toHaveCount(2);
  // The newest call (the repeat) got no text; the first call's thread still has the one text.
  await expect(callerPhone.getByTestId('phone-bubble')).toHaveCount(0);
  const original = page.getByTestId('practice-call-row').last();
  await original.getByRole('button', { name: /^\(239\) 555-01\d\d$/ }).click();
  await expect(callerPhone.getByTestId('phone-bubble')).toHaveCount(1);

  // 2. The caller replies; Your cell gets the lead.
  await page.getByLabel('Reply as the caller').fill('leaking water heater, garage');
  await page.getByTestId('practice-send-reply').click();
  const cell = page.getByTestId('practice-cell-phone');
  await expect(cell.getByTestId('phone-bubble')).toHaveText(
    /New lead from \(239\) 555-01\d\d: leaking water heater, garage/,
  );

  // 3. Mark it Junk: the practice list follows.
  const first = page.getByTestId('practice-call-row').last();
  await first.getByRole('button', { name: /^Junk: .*\(practice\)$/ }).click();
  await expect(first.getByTestId('practice-status')).toHaveText('Junk');

  // Nothing real was written, and no provider was ever involved.
  const line = await admin
    .schema('missed_call')
    .from('lines')
    .select('id')
    .eq('owner_id', userId)
    .single();
  const realCalls = await admin
    .schema('missed_call')
    .from('calls')
    .select('id')
    .eq('line_id', line.data?.id ?? '');
  expect(realCalls.data).toEqual([]);
  expect((await request.get('/api/dev/sms/sent')).status()).toBe(404);

  // It also shows on /calls, where real calls will be.
  await page.goto('/calls');
  await expect(page.getByTestId('practice-panel')).toBeVisible();

  // 4. Clear practice.
  await page.getByTestId('practice-clear').click();
  await expect(page.getByTestId('practice-call-row')).toHaveCount(0);

  // A real number and Messaging Service switch practice off.
  const set = await admin
    .schema('missed_call')
    .from('lines')
    .update({
      provider_number: `+1239571${digits}`,
      provider_messaging_service_sid: 'MG' + 'd'.repeat(32),
    })
    .eq('owner_id', userId);
  expect(set.error).toBeNull();
  await page.goto('/setup');
  await expect(page.getByTestId('practice-panel')).toHaveCount(0);
  await page.goto('/calls');
  await expect(page.getByTestId('practice-panel')).toHaveCount(0);
});
