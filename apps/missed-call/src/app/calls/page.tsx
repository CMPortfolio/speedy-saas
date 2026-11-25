import type { Metadata } from 'next';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';

import { CallList } from '@/features/calls/call-list';
import { listCalls } from '@/features/calls/queries';
import { practiceModeFor } from '@/features/practice/practice-mode';
import { PracticePanel } from '@/features/practice/practice-panel';
import { readPractice } from '@/features/practice/practice-state';
import { getMyLine } from '@/features/setup/line-queries';

export const metadata: Metadata = { title: 'Missed calls' };
export const dynamic = 'force-dynamic';

export default async function CallsPage() {
  await requireUser('/calls');
  const owner = await createServerSupabase();
  const [calls, line] = await Promise.all([listCalls(owner), getMyLine(owner)]);
  // Practice is decided on the server from the owner's saved line, never from the request.
  const practice = line && practiceModeFor(line) ? await readPractice(owner) : null;
  return (
    <section className="space-y-6 py-6">
      <h1 className="text-2xl font-semibold">Missed calls</h1>
      <CallList calls={calls} />
      {line && practice && <PracticePanel view={practice} ownerCell={line.ownerCell} />}
    </section>
  );
}
