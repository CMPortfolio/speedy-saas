# Speedy SaaS

One monorepo for every Speedy SaaS tool: small, tightly scoped tools for Southwest Florida
Main Street businesses, about one a week. Each tool solves one moment for an owner and must give
value in under 3 minutes. The playbook lives in the Operational Hub (Speedy SaaS tab).

The naples-standards skill applies in full. This file only adds monorepo rules. Precedence:
engineer's instruction in the session > this file > naples-standards > Superpowers > habits.

## Project facts

- Repo: CMPortfolio/speedy-saas · base branch: main
- Tickets: ClickUp, Naples AI › Dev Tickets (list `1600210000004742`), tag `speedy-saas`. The
  Speedy SaaS list (`1600210000004645`) holds the tool plans and the process, not tickets
- Branches: CU-<task id>-<slug> · commits: CU-<task id> type(scope): summary
- Scope names for commits: the app slug (job-photos) or the package (auth, db, ui, lib, sms,
  registry, config), or repo for root tooling
- Stack: pnpm workspaces + Turborepo; each tool is Next.js App Router + TypeScript strict +
  Tailwind + Supabase + Zod; Vitest + Playwright
- Hosting: Railway, one Railway project ("speedy-saas"), one service per app
- Domain: each tool lives at `<tool>.naplesaiagency.com` · DNS: Cloudflare · Email: Resend
- Database: one shared Supabase project for every tool, one sign-in across tools (auth cookie on
  `.naplesaiagency.com`)

## Layout

- apps/<slug>/ one Next.js app per tool, house src/ layout inside
- packages/config tsconfig, eslint, prettier, tailwind preset
- packages/ui shared components, cn(), layout shell, NaplesFooter, MoreFromNaplesAI
- packages/auth Supabase SSR clients, middleware, sign-in, requireUser/getOptionalUser
- packages/db supabase/ migrations, generated types, core-table schemas and queries
- packages/lib logger, createEnv, Result<T>, Resend client, fetch with timeout, phones
- packages/sms send and receive texts, webhook signature check, STOP/HELP/START
- packages/registry the list of every Naples AI tool and the website
- templates/tool scaffold copied by `pnpm new-tool <slug>`

## Commands

- Install: `pnpm install`
- Run one tool: `pnpm dev --filter <slug>`
- New tool: `pnpm new-tool <slug>`
- Checks (affected only): `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`,
  `pnpm build`. Add `--filter <slug>...` to check one tool and its packages.
- After a migration: `pnpm db:types`, then commit the generated types.

## Monorepo rules

1. An app never imports from another app. Shared code goes in a package.
2. Packages never import from apps. Packages only depend on other packages through
   their declared dependencies.
3. Move code into a package when a second tool needs it, not before. Auth, db, ui shell,
   logger and env are shared from day one.
4. Import shared code only through each package's `exports` (e.g. `@speedy/auth/server`).
   Never reach into a package's src/ by path. No barrel files.
5. App dependencies go in the app's package.json. The root package.json holds tooling only.
   Keep one version of each shared dependency across the repo.
6. All migrations live in packages/db/supabase/migrations. A tool's tables live in its own
   Postgres schema named after the slug (`job_photos`, `missed_call`, `rain_day`). Core tables
   in public (profiles, organizations, memberships, tool_usage, feedback) change only with the
   engineer's approval, called out in the plan.
7. Every new tool starts from `pnpm new-tool`. Never hand-copy another tool's folder.

## Product rules every tool follows

- One moment, one tool. The tool's README opens with its one-line scope (what it does and
  what it won't). Anything outside that line is a follow-up ticket, not code.
- Value before sign-in: an owner can use the core action without an account where the tool
  allows it. Sign-in only appears when they want to save or come back, or when the tool stores
  phone numbers.
- Under 3 minutes to value on a phone. Mobile-first, no tutorial needed.
- Every tool renders <NaplesFooter /> in its root layout and has an entry in
  packages/registry. Set status to live only when the engineer says the tool is shipping.
- Every tool has a landing page with title, description and Open Graph image, and a
  Playwright test for its one-moment flow.
- Owner-facing copy is plain, specific and written for the trade, not about AI.

## Definition of Done additions

On top of naples-standards section 16:

- [ ] Checks pass for every affected app and package, not only the one you changed
- [ ] Changing a package: every app that uses it still builds
- [ ] New tool: registry entry, NaplesFooter, landing metadata, README scope line,
      .env.example and the Playwright one-moment test are all present
- [ ] Migration: RLS policies for every operation, types regenerated, core-table changes
      approved

## Claude must never

- Push to main, merge a PR, or force-push anywhere
- Create, delete or change Supabase projects, Railway services, domains, DNS or Resend
  settings, or set production env vars, unless the engineer asks for it in the session. Otherwise
  write what's needed in the PR; the engineer does it
- Run a migration against production, or edit production data
- Put the Supabase service-role key or any secret in client code, logs, tests or commits
- Send email or texts to real addresses or numbers from development or tests (use Resend test
  addresses and the fake SMS provider)
- Copy code between apps instead of extracting a package
- Change core tables, packages/auth or packages/config without saying so in the plan
- Add a new framework, language or UI library to one tool. Every tool uses the same stack
- Skip, delete or weaken a test, or bypass hooks (--no-verify) to get green
- Touch other Naples AI repos (milo-app, MIA-Learning, duelendar, Ai-Agency) from here.
  Cross-repo changes are separate tickets
- Mark a ClickUp task complete, or change its dates, assignees or priority
