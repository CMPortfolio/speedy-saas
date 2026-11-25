import type { Metadata } from 'next';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';

import { env } from '@/config/env';
import { PracticePanel } from '@/features/practice/practice-panel';
import { practiceModeFor, lineNumberReady } from '@/features/practice/practice-mode';
import { readPractice } from '@/features/practice/practice-state';
import { LineStatus } from '@/features/setup/line-status';
import { CellConfirm } from '@/features/setup/cell-confirm';
import { ForwardingGuide } from '@/features/setup/forwarding-guide';
import { getMyLine } from '@/features/setup/line-queries';
import { SetupForm } from '@/features/setup/setup-form';

export const metadata: Metadata = { title: 'Set up' };
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  await requireUser('/setup');
  const owner = await createServerSupabase();
  const line = await getMyLine(owner);
  // Ready means a number and, on the real provider in production, the owner's Messaging Service too.
  const numberReady = line ? lineNumberReady(line, env.SMS_PROVIDER, env.NODE_ENV) : false;
  // Practice is decided here, on the server, from the saved line: no real number, practice phone.
  const practice = line && practiceModeFor(line) ? await readPractice(owner) : null;
  return (
    <section className="space-y-8 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Set up missed call texts</h1>
        <p className="text-muted">
          Tell us who you are and what to text. It takes about three minutes.
        </p>
      </header>

      <SetupForm line={line} numberReady={numberReady} />

      {line && <LineStatus line={line} numberReady={numberReady} />}

      {line && practice && (
        <PracticePanel view={practice} ownerCell={line.ownerCell} from="/setup" />
      )}

      {line && !line.ownerCellVerified && <CellConfirm canSend={numberReady} />}

      {numberReady && line?.providerNumber && (
        <ForwardingGuide providerNumber={line.providerNumber} />
      )}
    </section>
  );
}
