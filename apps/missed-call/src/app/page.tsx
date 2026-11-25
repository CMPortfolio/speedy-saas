import Link from 'next/link';

import { buttonClasses } from '@speedy/ui/button';
import { PageHeader } from '@speedy/ui/page-header';
import { Steps } from '@speedy/ui/steps';

import { tool } from '../../tool.config';

/**
 * Landing page. Plain copy for the trade: the moment, what happens, and why this tool asks for a
 * sign-in up front (it stores the business number and the owner's cell).
 */
export default function LandingPage() {
  return (
    <div className="space-y-8 py-2">
      <PageHeader
        size="hero"
        eyebrow="For businesses that miss calls on the job"
        title={tool.headline}
        description={tool.lede}
        actions={
          <Link
            href="/sign-in?next=/setup"
            data-testid="start"
            className={buttonClasses({ size: 'lg', fullWidth: true })}
          >
            Start
          </Link>
        }
      />
      <p className="text-muted" data-testid="why-sign-in">
        You sign in first, because this keeps your business number and your cell on file. That is
        how it knows which calls you missed and where to send the replies. Nothing is saved until
        you do.
      </p>
      <section aria-labelledby="how" className="space-y-4">
        <h2 id="how" className="text-3xl text-ink">
          How it works
        </h2>
        <Steps
          items={[
            {
              body: 'You tell us your business name, your cell and what to text. About three minutes.',
            },
            {
              body: (
                <>
                  You dial one code on your phone so calls you don&apos;t answer go to your
                  missed-call number.
                </>
              ),
            },
            { body: 'The caller gets your text within seconds, asking what they need.' },
            {
              body: 'Their reply lands in one list and gets texted to your cell. Tap to call back, or mark it Booked or Junk.',
            },
          ]}
        />
        <p className="text-muted">
          Works on your phone, no app to install. It just gets you the lead before they call the
          next guy.
        </p>
      </section>
    </div>
  );
}
