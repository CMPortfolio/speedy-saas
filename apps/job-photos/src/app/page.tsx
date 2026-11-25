import Link from 'next/link';

import { buttonClasses } from '@speedy/ui/button';
import { PageHeader } from '@speedy/ui/page-header';
import { Steps } from '@speedy/ui/steps';

import { tool } from '../../tool.config';

/** Landing page: the moment, what happens, and the one button. No account needed to start. */
export default function LandingPage() {
  return (
    <div className="space-y-8 py-2">
      <PageHeader
        size="hero"
        eyebrow="For techs on the job"
        title={tool.headline}
        description={tool.lede}
        actions={
          <Link
            href="/new"
            data-testid="start"
            className={buttonClasses({ size: 'lg', fullWidth: true })}
          >
            Start a job
          </Link>
        }
      />
      <Steps
        items={[
          { body: 'Snap up to six photos before you start and six when you finish.' },
          { body: 'Add a one-line note if you want.' },
          { body: 'Send the link from your phone. The customer sees them side by side.' },
        ]}
      />
      <div className="space-y-1 text-sm text-muted">
        <p>No account needed. Sign in later if you want to keep your past jobs.</p>
        <Link
          href="/jobs"
          className="inline-flex min-h-tap items-center font-medium text-primary underline underline-offset-4 hover:text-primary-hover"
        >
          Already saving yours? My jobs
        </Link>
      </div>
    </div>
  );
}
