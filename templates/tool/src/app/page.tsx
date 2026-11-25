import Link from 'next/link';

import { buttonClasses } from '@speedy/ui/button';
import { PageHeader } from '@speedy/ui/page-header';
import { Steps } from '@speedy/ui/steps';

import { tool } from '../../tool.config';

/**
 * Landing page. Plain copy for the trade: the moment, what happens, what it costs them now.
 * Replace the placeholder copy before shipping; keep the Start button above the fold.
 */
export default function LandingPage() {
  return (
    <div className="space-y-8 py-2">
      <PageHeader
        size="hero"
        eyebrow="EYEBROW: who this is for"
        title={tool.headline}
        description={tool.lede}
        actions={
          <Link
            href="/start"
            data-testid="start"
            className={buttonClasses({ size: 'lg', fullWidth: true })}
          >
            Start
          </Link>
        }
      />
      <Steps
        items={[
          { body: 'Works on your phone, no app to install.' },
          { body: 'Under 3 minutes from opening it to done.' },
          { body: 'Sign in only if you want to come back to your work.' },
        ]}
      />
    </div>
  );
}
