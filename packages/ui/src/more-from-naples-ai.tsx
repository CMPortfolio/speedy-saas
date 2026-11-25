import { selectMoreTools, websiteEntry } from '@speedy/registry/select';
import { TOOLS } from '@speedy/registry/tools';
import type { Tool } from '@speedy/registry/tools';

import { cn } from './cn';

export interface MoreFromNaplesAIProps {
  /** The registry slug of the tool rendering this, so it never lists itself. */
  currentSlug?: string | undefined;
  /** How many other tools to show. Defaults to 3. */
  limit?: number;
  /** Override the registry (tests, previews). */
  tools?: readonly Tool[];
  className?: string;
}

/**
 * Up to three other live Naples AI tools, each a link with name and pitch, plus a link to the
 * website. With no other live tools, only the website link renders.
 */
export function MoreFromNaplesAI({
  currentSlug,
  limit = 3,
  tools = TOOLS,
  className,
}: MoreFromNaplesAIProps) {
  const more = selectMoreTools(tools, currentSlug, limit);
  const site = websiteEntry(tools);

  return (
    <nav aria-label="More from Naples AI" className={cn('flex flex-col gap-3', className)}>
      {more.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-ink">More from Naples AI</h2>
          <ul className="grid gap-2 sm:grid-cols-3">
            {more.map((tool) => (
              <li key={tool.slug}>
                <a
                  href={tool.url}
                  className={cn(
                    'flex min-h-tap flex-col justify-center rounded-brand border border-border',
                    'bg-surface px-3 py-2 hover:border-primary',
                  )}
                >
                  <span className="text-sm font-medium text-ink">{tool.name}</span>
                  <span className="text-xs text-muted">{tool.pitch}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <a
        href={site.url}
        className="inline-flex min-h-tap items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        See everything at {site.name}
      </a>
    </nav>
  );
}
