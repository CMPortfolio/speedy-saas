import type { Metadata } from 'next';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';

import { CallList } from '@/features/calls/call-list';
import { listCalls } from '@/features/calls/queries';

export const metadata: Metadata = { title: 'Missed calls' };
export const dynamic = 'force-dynamic';

export default async function CallsPage() {
  await requireUser('/calls');
  const calls = await listCalls(await createServerSupabase());
  return (
    <section className="space-y-4 py-6">
      <h1 className="text-2xl font-semibold">Missed calls</h1>
      <CallList calls={calls} />
    </section>
  );
}
