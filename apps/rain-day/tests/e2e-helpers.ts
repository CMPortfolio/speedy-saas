import type { APIRequestContext, Page } from '@playwright/test';

/**
 * Helpers for the one-moment test. It signs in the way a magic link would (Supabase admin API
 * makes the link; the app's own /auth/callback turns it into a session) and talks to the
 * app's webhooks with the fake provider's public test signature. Needs the local Supabase stack:
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const hasSupabase = Boolean(supabaseUrl && serviceKey);

const FAKE_SIGNATURE_HEADER = 'x-speedy-fake-signature';
const FAKE_SIGNATURE = 'fake-signature-ok';
export const BUSINESS_NUMBER = '+12395550100';

function adminHeaders() {
  return {
    apikey: serviceKey ?? '',
    Authorization: `Bearer ${serviceKey ?? ''}`,
    'content-type': 'application/json',
  };
}

export interface TestOwner {
  id: string;
  email: string;
  tokenHash: string;
}

/** A new confirmed user and a one-time sign-in token for them. */
export async function createOwner(request: APIRequestContext): Promise<TestOwner> {
  const email = `${crypto.randomUUID()}@resend.dev`;
  const created = await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: adminHeaders(),
    data: { email, email_confirm: true },
  });
  if (!created.ok()) throw new Error(`could not create the test owner: ${created.status()}`);
  const { id } = (await created.json()) as { id: string };
  const link = await request.post(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    headers: adminHeaders(),
    data: { type: 'magiclink', email },
  });
  if (!link.ok()) throw new Error(`could not make a sign-in link: ${link.status()}`);
  const body = (await link.json()) as { hashed_token: string };
  return { id, email, tokenHash: body.hashed_token };
}

export async function deleteOwner(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`${supabaseUrl}/auth/v1/admin/users/${id}`, { headers: adminHeaders() });
}

/** Open the app's own callback with the token, as clicking the emailed link would. */
export async function signIn(page: Page, owner: TestOwner, next = '/settings'): Promise<void> {
  await page.goto(
    `/auth/callback?token_hash=${owner.tokenHash}&type=magiclink&next=${encodeURIComponent(next)}`,
  );
}

const signed = {
  headers: { [FAKE_SIGNATURE_HEADER]: FAKE_SIGNATURE, 'content-type': 'application/json' },
};

/** A customer texts the business number. Goes through the real signed inbound webhook. */
export async function customerTexts(
  request: APIRequestContext,
  from: string,
  body: string,
): Promise<number> {
  const res = await request.post('/api/sms/inbound', {
    ...signed,
    data: {
      kind: 'inbound',
      from,
      to: BUSINESS_NUMBER,
      body,
      providerMessageId: `FAKE-IN-${crypto.randomUUID()}`,
    },
  });
  return res.status();
}

/** The provider reports a text delivered, through the real signed status webhook. */
export async function reportDelivered(
  request: APIRequestContext,
  providerMessageId: string,
): Promise<number> {
  const res = await request.post('/api/sms/status', {
    ...signed,
    data: { kind: 'delivery', providerMessageId, status: 'delivered' },
  });
  return res.status();
}

/** Next date (on or after today in New York) falling on this weekday, 0 = Sunday. */
export function nextWeekday(weekday: number, now = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const date = new Date(`${today}T00:00:00Z`);
  while (date.getUTCDay() !== weekday) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
