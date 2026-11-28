import { websiteEntry } from '@speedy/registry/select';
import type { Tool } from '@speedy/registry/tools';

import { cn } from './cn';
import { MoreFromNaplesAI } from './more-from-naples-ai';

export interface NaplesFooterProps {
  /** The registry slug of the tool rendering this footer. */
  currentSlug?: string | undefined;
  /** Override the registry (tests, previews). */
  tools?: readonly Tool[];
  className?: string;
}

/**
 * The footer every tool renders in its root layout: other Naples AI tools, a "Built by
 * Naples AI" link to the website and the small print.
 */
export function NaplesFooter({ currentSlug, tools, className }: NaplesFooterProps) {
  const site = tools ? websiteEntry(tools) : websiteEntry();
  const year = new Date().getFullYear();

  return (
    <footer className={cn('border-t border-border bg-surface', className)}>
      <div className="mx-auto flex w-full max-w-screen-sm flex-col gap-6 px-4 py-8">
        <MoreFromNaplesAI currentSlug={currentSlug} {...(tools ? { tools } : {})} />
        <div className="flex flex-col gap-1 text-xs text-muted">
          <p>
            Built by{' '}
            <a
              href={site.url}
              className="inline-flex min-h-tap items-center font-medium text-primary underline-offset-4 hover:underline"
            >
              {site.name}
            </a>{' '}
            in Naples, Florida.
          </p>
          <p>&copy; {year} Naples AI. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
