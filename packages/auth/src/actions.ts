'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { appOrigin } from './app-origin';
import { safeNext } from './safe-next';
import { createServerSupabase } from './server';

const emailSchema = z.object({
  email: z.email('Enter the email you want the sign-in link sent to.'),
  next: z.string().startsWith('/').max(500).optional(),
});

export type SendMagicLinkState =
  { status: 'idle' } | { status: 'sent'; email: string } | { status: 'error'; message: string };

/** Server action behind the sign-in form: sends a magic link to the email. */
export async function sendMagicLink(
  _prev: SendMagicLinkState,
  formData: FormData,
): Promise<SendMagicLinkState> {
  const parsed = emailSchema.safeParse({
    email: String(formData.get('email') ?? '').trim(),
    next: formData.get('next') ? String(formData.get('next')) : undefined,
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Check the email address.',
    };
  }
  // APP_URL first: the Origin header is chosen by whoever sends the request.
  const origin = appOrigin((await headers()).get('origin') ?? undefined);
  const next = safeNext(parsed.data.next);
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    return {
      status: 'error',
      message: 'We could not send the link just now. Try again in a minute.',
    };
  }
  return { status: 'sent', email: parsed.data.email };
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
}
