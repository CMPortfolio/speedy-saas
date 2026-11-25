import { websiteEntry } from '@speedy/registry/select';
import type { Tool } from '@speedy/registry/tools';

import { cn } from './cn';
import { MoreFromNaplesAI } from './more-from-naples-ai';
import { NaplesMark } from './naples-mark';

export interface NaplesFooterProps {
  /** The registry slug of the tool rendering this footer. */
  currentSlug?: string | undefined;
  /** Override the registry (tests, previews). */
  tools?: readonly Tool[];
  className?: string;
}

/**
 * The footer every tool renders in its root layout, styled like the naplesaiagency.com footer:
 * navy band, the mark on a white chip, other Naples AI tools, a "Built by Naples AI" link to
 * the website and the small print.
 */
export function NaplesFooter({ currentSlug, tools, className }: NaplesFooterProps) {
  const site = tools ? websiteEntry(tools) : websiteEntry();
  const year = new Date().getFullYear();

  return (
    <footer className={cn('bg-navy text-sm text-on-navy', className)}>
      <div className="mx-auto flex w-full max-w-screen-sm flex-col gap-8 px-4 pb-9 pt-12">
        <div className="space-y-3">
          <a
            href={site.url}
            className="inline-flex min-h-tap items-center gap-2.5 text-base font-semibold text-white"
          >
            <NaplesMark chip />
            Naples AI
          </a>
          <p className="max-w-[34ch]">
            Simple tools for businesses in Naples and Southwest Florida.
          </p>
        </div>
        <MoreFromNaplesAI currentSlug={currentSlug} {...(tools ? { tools } : {})} />
        <div className="flex flex-col gap-1 border-t border-line-dark pt-6 text-[0.85rem] text-on-navy-muted">
          <p>
            Built by{' '}
            <a
              href={site.url}
              className="inline-flex min-h-tap items-center font-medium text-white underline underline-offset-4"
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
