# @speedy/ui

Shared React components for every Speedy SaaS tool: `cn()`, the page shell, form controls,
the modal, the empty state, and the footer every tool renders (`NaplesFooter`, which includes
`MoreFromNaplesAI`). Consumed as TypeScript source, styled with Tailwind v4 classes from the
house preset in `@speedy/config/tailwind`.

## Exports

| Import                           | What it is                                                              |
| -------------------------------- | ----------------------------------------------------------------------- |
| `@speedy/ui/cn`                  | `cn(...classes)`: clsx + tailwind-merge                                 |
| `@speedy/ui/button`              | `Button` (primary, secondary, ghost, danger; sm, md, lg; `loading`)     |
| `@speedy/ui/input`               | `Input` with a required label, optional hint and error (client)         |
| `@speedy/ui/modal`               | `Modal` on a native `<dialog>` (client)                                 |
| `@speedy/ui/empty-state`         | `EmptyState` with icon, title, description and action slots             |
| `@speedy/ui/shell`               | `AppShell`: header, centred `main`, footer slot                         |
| `@speedy/ui/naples-footer`       | `NaplesFooter`: `MoreFromNaplesAI` + "Built by Naples AI" + small print |
| `@speedy/ui/more-from-naples-ai` | `MoreFromNaplesAI`: up to 3 other live tools and the website link       |

No barrel file. Import each component from its own path (CLAUDE.md rule 4). Everything except
`Input` and `Modal` is a server component; those two use hooks and carry `'use client'`.

## Using it in an app

1. Add the dependency and let Next.js compile the package source:

   ```json
   // apps/<slug>/package.json
   { "dependencies": { "@speedy/ui": "workspace:*" } }
   ```

   ```ts
   // apps/<slug>/next.config.ts
   const nextConfig = { transpilePackages: ['@speedy/ui', '@speedy/registry'] };
   export default nextConfig;
   ```

2. Let Tailwind see the package's classes. In the app's `globals.css`:

   ```css
   @import 'tailwindcss';
   @import '@speedy/config/tailwind';
   @source '../../node_modules/@speedy/ui/src';
   ```

   The `@source` path is relative to the CSS file; adjust it if your globals.css sits deeper
   than `apps/<slug>/src/app/`.

3. Render the shell and the footer once, in the root layout:

   ```tsx
   import { NaplesFooter } from '@speedy/ui/naples-footer';
   import { AppShell } from '@speedy/ui/shell';

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="en">
         <body>
           <AppShell toolName="Job Photos" footer={<NaplesFooter currentSlug="job-photos" />}>
             {children}
           </AppShell>
         </body>
       </html>
     );
   }
   ```

   `currentSlug` is the tool's slug in `packages/registry`. The footer never lists the current
   tool, a tool with status `building`, or the website as a tool.

## Tokens

Components only use tokens from `packages/config/tailwind.preset.css`: `bg-primary`,
`bg-primary-hover`, `text-primary-foreground`, `bg-surface`, `bg-background`, `text-ink`,
`text-muted`, `border-border`, `bg-danger` / `text-danger` / `border-danger`, `rounded-brand`,
and `min-h-tap` / `min-w-tap` (44px). Add a token to the preset and `brand.js` together before
using a new one here.

## Accessibility rules

These hold for every component in this package and every screen built with it:

- **Labels.** Every form control has a visible label tied to it by `id`. `Input` renders its
  label always; placeholders are not labels. Hints and errors are linked through
  `aria-describedby`, and errors set `aria-invalid` and `role="alert"`.
- **Focus.** Keyboard focus is always visible: `focus-visible:outline-2 outline-offset-2
outline-primary`, never `outline-none` without a replacement. `Modal` uses the native
  `<dialog>` so focus stays inside it and Escape closes it.
- **44px targets.** Anything an owner taps is at least 44x44px (`min-h-tap min-w-tap`):
  buttons, links in the header and footer, list rows that act as links.
- **Plain copy.** Button text says what happens ("Send the photos"), not "Submit". Empty states
  say what to do next.
- **Icons are decorative.** Icon slots are `aria-hidden`; the text next to them carries the
  meaning. An icon-only button gets an `aria-label`.

## Testing

`pnpm test --filter @speedy/ui` runs Vitest in jsdom with Testing Library and
`@testing-library/jest-dom`. Query by role and label, the way a screen reader would.
