import type { ReactNode } from 'react';

import { cn } from './cn';
import { Eyebrow } from './eyebrow';

export interface PageHeaderProps {
  /** Short label above the title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One or two plain sentences under the title. */
  description?: ReactNode;
  /** `hero` is the big landing headline; `page` is the title of an inner page. */
  size?: 'hero' | 'page';
  /** Buttons that belong with the title. */
  actions?: ReactNode;
  className?: string;
}

/** Eyebrow, serif title, lede, actions: the site's hero pattern, also used for page titles. */
export function PageHeader({
  eyebrow,
  title,
  description,
  size = 'page',
  actions,
  className,
}: PageHeaderProps) {
  const hero = size === 'hero';
  return (
    <header className={cn('space-y-4', className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1
        className={cn(
          'text-ink',
          hero
            ? 'text-[2.5rem] leading-[1.06] tracking-[-0.02em] sm:text-5xl'
            : 'text-3xl leading-tight',
        )}
      >
        {title}
      </h1>
      {description && (
        <p className={cn('text-ink-2', hero ? 'text-lg leading-relaxed' : 'text-base')}>
          {description}
        </p>
      )}
      {actions && <div className="flex flex-wrap gap-3 pt-2">{actions}</div>}
    </header>
  );
}
