import type { ReactNode } from 'react';

import { cn } from './cn';
import { NaplesMark } from './naples-mark';

export interface AppShellProps {
  /** The tool's name, shown in the header next to the Naples AI mark and linked to its home. */
  toolName: ReactNode;
  /** Where the tool name links to. Defaults to `/`. */
  homeHref?: string;
  /** App navigation or a sign-in link. On a phone it wraps to its own row under the logo. */
  headerRight?: ReactNode;
  children: ReactNode;
  /** Usually `<NaplesFooter currentSlug="..." />`. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Mobile-first page frame for every tool: a white header with the Naples AI mark and the tool
 * name (64px tall on a phone, 72px from `sm`), a centred `main` that stays at phone width
 * (`max-w-screen-sm`) and a footer slot. Render it once in the root layout.
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
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-0 focus:top-0 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-sm flex-wrap items-center gap-x-3 px-4">
          <div className="flex min-h-16 items-center gap-3 sm:min-h-18">
            <a
              href="https://naplesaiagency.com"
              className="inline-flex min-h-tap items-center gap-2 text-base font-semibold text-brand-deep"
            >
              <NaplesMark />
              Naples AI
            </a>
            <span aria-hidden="true" className="h-5 w-px bg-line" />
            <a
              href={homeHref}
              className="inline-flex min-h-tap items-center text-base font-medium text-ink"
            >
              {toolName}
            </a>
          </div>
          {headerRight && (
            <div className="order-last -mx-2 flex basis-full items-center gap-1 overflow-x-auto pb-1 sm:order-none sm:mx-0 sm:ml-auto sm:basis-auto sm:pb-0">
              {headerRight}
            </div>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-screen-sm flex-1 px-4 py-8">
        {children}
      </main>
      {footer}
    </div>
  );
}
