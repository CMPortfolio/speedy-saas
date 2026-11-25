import type { ReactNode } from 'react';

import { cn } from './cn';

export interface StepItem {
  title?: ReactNode;
  body: ReactNode;
}

/**
 * Numbered steps on a navy panel with orange numerals, like "How we work" on the site.
 * Renders an ordered list, so the order is announced.
 */
export function Steps({ items, className }: { items: readonly StepItem[]; className?: string }) {
  return (
    <ol className={cn('space-y-6 bg-navy p-6 text-on-navy-strong', className)}>
      {items.map((item, index) => (
        <li key={index} className="border-t border-line-dark pt-5 first:border-t-0 first:pt-0">
          <span aria-hidden="true" className="mb-2 block text-sm font-semibold text-orange">
            {String(index + 1).padStart(2, '0')}
          </span>
          {item.title ? (
            <h3 className="mb-1 text-base font-semibold text-white">{item.title}</h3>
          ) : null}
          <p className="text-[0.95rem] leading-relaxed text-on-navy-strong">{item.body}</p>
        </li>
      ))}
    </ol>
  );
}
