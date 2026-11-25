import Link from 'next/link';

import { cn } from '@speedy/ui/cn';

import { tool } from '../../tool.config';

/**
 * Landing page. Plain copy for the trade: the moment, what happens, and why this tool asks for a
 * sign-in up front (it stores the business number and the owner's cell).
 */
export default function LandingPage() {
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold leading-tight">{tool.name}</h1>
        <p className="text-lg text-muted">{tool.scope}</p>
      </header>
      <Link
        href="/sign-in?next=/setup"
        data-testid="start"
        className={cn(
          'flex min-h-tap w-full items-center justify-center rounded-brand bg-primary px-6 text-lg font-medium',
          'text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        )}
      >
        Start
      </Link>
      <p className="text-muted" data-testid="why-sign-in">
        This one asks you to sign in first. It keeps the number customers call and your own cell on
        file so it knows which calls you missed and where to send the replies. Phone numbers stay
        behind a sign-in; nothing is saved until you do.
      </p>
      <section aria-labelledby="how" className="space-y-3">
        <h2 id="how" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-muted">
          <li>You tell us your business name, your cell and what to text. About three minutes.</li>
          <li>
            You dial one code on your phone so calls you don&apos;t answer go to your missed-call
            number.
          </li>
          <li>The caller gets your text within seconds, asking what they need.</li>
          <li>
            Their reply lands in one list and gets texted to your cell. Tap to call back, or mark it
            Booked or Junk.
          </li>
        </ol>
        <p className="text-muted">
          Works on your phone, no app to install. It&apos;s not a phone system or an answering
          service. It just gets you the lead before they call the next guy.
        </p>
      </section>
    </section>
  );
}
