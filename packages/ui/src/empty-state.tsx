import type { ReactNode } from 'react';

import { cn } from './cn';

export interface EmptyStateProps {
  /** A small icon or illustration. Decorative: it is hidden from assistive tech. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Usually one `<Button>`: the next thing the owner should do. */
  action?: ReactNode;
  className?: string;
}

/** What an owner sees before there is anything to show. Says what to do next. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <section
      className={cn(
        'flex flex-col items-center gap-3 rounded-brand border border-dashed border-border',
        'bg-surface px-6 py-10 text-center',
        className,
      )}
    >
      {icon && (
        <div aria-hidden="true" className="text-muted [&>svg]:size-10">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {description && <p className="max-w-prose text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </section>
  );
}
