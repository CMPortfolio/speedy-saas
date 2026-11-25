import Link from 'next/link';

import { formatUsPhone } from '@speedy/lib/phone';

import type { MyLine } from './line-queries';

/** The number, whether the cell is confirmed, and a link to the missed calls. */
export function LineStatus({ line, numberReady }: { line: MyLine; numberReady: boolean }) {
  return (
    <section className="space-y-3" data-testid="line-status">
      <h2 className="text-lg font-semibold">Your line</h2>
      {numberReady && line.providerNumber ? (
        <p>
          Your missed-call number is{' '}
          <strong data-testid="provider-number">{formatUsPhone(line.providerNumber)}</strong>.
        </p>
      ) : (
        <p data-testid="number-pending">
          We&apos;re getting your missed-call number ready. It shows up here when it&apos;s set, and
          then you can turn on forwarding.
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
  );
}
