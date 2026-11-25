import { formatUsPhone } from '@speedy/lib/phone';

import { CARRIERS, FORWARDING_FALLBACK, dialDigits } from '@/config/carrier-codes';

/** `#` has to be %23 in a tel: link or the phone drops it. */
export function dialHref(code: string): string {
  return `tel:${code.replace(/#/g, '%23')}`;
}

/** Steps to send missed calls to the business number, with each carrier's dial code. */
export function ForwardingGuide({ providerNumber }: { providerNumber: string }) {
  const digits = dialDigits(providerNumber);
  return (
    <section
      className="space-y-4"
      aria-labelledby="forwarding-title"
      data-testid="forwarding-guide"
    >
      <h2 id="forwarding-title" className="text-lg font-semibold">
        Send missed calls to {formatUsPhone(providerNumber)}
      </h2>
      <p className="text-muted">
        On your cell, dial the code for your carrier and press call. Calls you don&apos;t answer go
        to this number, and the caller gets your text. Calls you answer are not touched.
      </p>
      <ul className="space-y-3">
        {CARRIERS.map((carrier) => {
          const code = carrier.activate(digits);
          return (
            <li
              key={carrier.id}
              data-testid={`carrier-${carrier.id}`}
              className="space-y-2 rounded-brand border border-border bg-surface p-4"
            >
              <h3 className="font-semibold">{carrier.name}</h3>
              <p>
                Turn on:{' '}
                <a
                  href={dialHref(code)}
                  className="font-mono text-lg underline"
                  data-testid="activate-code"
                >
                  {code}
                </a>
              </p>
              <p>
                Turn off: <span className="font-mono">{carrier.cancel}</span>
                {carrier.status && (
                  <>
                    {' '}
                    · Check if it&apos;s on: <span className="font-mono">{carrier.status}</span>
                  </>
                )}
              </p>
              {carrier.note && <p className="text-sm text-muted">{carrier.note}</p>}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted">{FORWARDING_FALLBACK}</p>
    </section>
  );
}
