import type { Metadata } from 'next';

import { SignInForm } from '@speedy/auth/sign-in';
import { safeNext } from '@speedy/auth/safe-next';

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
  return (
    <section className="py-6">
      <SignInForm next={safeNext(params.next)} linkError={params.error === 'link'} />
    </section>
  );
}
