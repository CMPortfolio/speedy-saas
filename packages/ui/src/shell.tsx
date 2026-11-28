import type { ReactNode } from 'react';

import { cn } from './cn';

export interface AppShellProps {
  /** The tool's name, shown in the header and linked to its home. */
  toolName: ReactNode;
  /** Where the tool name links to. Defaults to `/`. */
  homeHref?: string;
  /** Right side of the header: a sign-in link, a menu, a status pill. */
  headerRight?: ReactNode;
  children: ReactNode;
  /** Usually `<NaplesFooter currentSlug="..." />`. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Mobile-first page frame for every tool: sticky header, a centred `main` that stays at
 * phone width (`max-w-screen-sm`) and a footer slot. Render it once in the root layout.
 */
export function AppShell({
  toolName,
  homeHref = '/',
  headerRight,
  children,
  footer,
  className,
}: AppShellProps) {
  return (
    <div className={cn('flex min-h-dvh flex-col bg-background text-ink', className)}>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex min-h-tap w-full max-w-screen-sm items-center justify-between gap-4 px-4">
          <a
            href={homeHref}
            className="inline-flex min-h-tap items-center rounded-brand text-base font-semibold text-ink"
          >
            {toolName}
          </a>
          {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
        </div>
      </header>
      <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 py-6">{children}</main>
      {footer}
    </div>
  );
}
