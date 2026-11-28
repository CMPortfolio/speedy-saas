import type { Metadata } from 'next';
import Link from 'next/link';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { formatUsPhone } from '@speedy/lib/phone';

import { env } from '@/config/env';
import { serviceMissing } from '@/features/missed-calls/store';
import { CellConfirm } from '@/features/setup/cell-confirm';
import { ForwardingGuide } from '@/features/setup/forwarding-guide';
import { getMyLine } from '@/features/setup/line-queries';
import { SetupForm } from '@/features/setup/setup-form';

export const metadata: Metadata = { title: 'Set up' };
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  await requireUser('/setup');
  const line = await getMyLine(await createServerSupabase());
  // Ready means a number and, on the real provider in production, the owner's Messaging Service too.
  const numberReady = Boolean(
    line?.providerNumber && !serviceMissing(line, { name: env.SMS_PROVIDER }, env.NODE_ENV),
  );
  return (
    <section className="space-y-8 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Set up missed call texts</h1>
        <p className="text-muted">
          Tell us who you are and what to text. It takes about three minutes.
        </p>
      </header>

      <SetupForm line={line} numberReady={numberReady} />

      {line && (
        <section className="space-y-3" data-testid="line-status">
          <h2 className="text-lg font-semibold">Your line</h2>
          {numberReady && line.providerNumber ? (
            <p>
              Your missed-call number is{' '}
              <strong data-testid="provider-number">{formatUsPhone(line.providerNumber)}</strong>.
            </p>
          ) : (
            <p data-testid="number-pending">
              We&apos;re getting your missed-call number ready. It shows up here when it&apos;s set,
              and then you can turn on forwarding.
            </p>
          )}
          {line.ownerCellVerified && (
            <p data-testid="cell-confirmed">
              Your cell is confirmed. Replies get texted to {formatUsPhone(line.ownerCell)}.
            </p>
          )}
          <Link href="/calls" className="inline-flex min-h-tap items-center underline">
            See your missed calls
          </Link>
        </section>
      )}

      {line && !line.ownerCellVerified && <CellConfirm canSend={numberReady} />}

      {numberReady && line?.providerNumber && (
        <ForwardingGuide providerNumber={line.providerNumber} />
      )}
    </section>
  );
}
