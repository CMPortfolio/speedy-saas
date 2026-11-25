import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignInForm } from '@speedy/auth/sign-in';
import { getOptionalUser } from '@speedy/auth/user';

import { rainDayNext } from '@/lib/next-path';

export const metadata: Metadata = { title: 'Sign in' };

interface SearchParams {
  next?: string;
  error?: string;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = rainDayNext(params.next);
  // One sign-in is shared across the tools: someone already signed in on another tool has no use
  // for a sign-in form here, and asking for a new link only starts a loop of emails.
  if (await getOptionalUser()) redirect(next);
  return (
    <section className="py-6">
      <SignInForm next={next} linkError={params.error === 'link'} />
    </section>
  );
}
