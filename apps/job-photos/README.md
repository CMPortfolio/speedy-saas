A tech snaps before and after photos on a job and sends the customer one link that shows them side by side. It won't do invoices, scheduling, a photo library across jobs, or editing beyond crop and rotate.

# Job Photos

Speedy SaaS tool `job-photos`. Lives at `https://job-photos.naplesaiagency.com`. Ticket: [Job photos P1: scaffold the job-photos app](https://app.clickup.com/t/1dfc7p9xnhn).

## Run it

```bash
cp apps/job-photos/.env.example apps/job-photos/.env.local   # fill in the shared Supabase values
pnpm dev --filter @speedy/job-photos                        # http://localhost:3001
pnpm turbo run typecheck lint test --filter @speedy/job-photos...
pnpm test:e2e --filter @speedy/job-photos                   # builds, starts, runs Playwright on a phone viewport
```

## Layout

```
src/app/        routes: landing (/), sign-in, auth/callback, opengraph-image
src/components/ presentational pieces for this tool only (shared ones go in @speedy/ui)
src/features/   one folder per user-facing flow: server actions, queries, UI
src/lib/        helpers that are specific to this tool
src/hooks/      client hooks
src/config/     env.ts (createEnv) and constants
tests/          Playwright one-moment test(s); tests/unit for Vitest
tool.config.ts  slug, name, scope line, schema, dev port, URL
```

## Saving jobs (sign-in)

Nothing needs an account until the owner wants to keep jobs. "Save my jobs" starts magic-link
sign-in (`/sign-in?next=/jobs`). On `/jobs` the phone sends the claim tokens it kept for the
jobs it made (`@speedy/lib/device-claims`) to `POST /api/jobs/claim`; the server attaches the
jobs whose token hashes match (constant-time compare), clears their expiry and token, moves the
business name and logo from the phone to the profile, and records a `tool_usage` row. `/jobs`
lists past jobs newest first and is protected in `src/proxy.ts`.

## Share page

`/j/<slug>` is what the customer opens: business name and logo, before and after side by side
(stacked under 640px), the note, the date and a "Leave a review" button when the owner added a
review link. It is read by `share_slug` with the service client only, photos through 10-minute
signed URLs. Unknown slug: 404. Expired anonymous job: a plain "This link has expired" page.
`/j/<slug>/opengraph-image` is the link preview: first before and after photo side by side, or
the brand card when the job has no photos.

## Storage

Photos go to the private Supabase Storage bucket `job-photos` through the adapter in
`@speedy/lib/photos`. `STORAGE_DRIVER=memory` keeps them in the server process instead, for
development without a Supabase project; it is refused when `NODE_ENV=production`.

## Database

This tool's tables live in the Postgres schema `job_photos` in the shared Supabase project.
Migrations go in `packages/db/supabase/migrations/` (`*_job_photos_init.sql` and `*_job_photos_tables.sql`). Every
table has RLS with a policy per operation. After a migration run `pnpm db:types` and commit.
Expose the schema to the API: `api.schemas` in `packages/db/supabase/config.jsonc` locally and
the hosted project's API settings in production.

## Deploy (Railway, one service per tool)

- Root directory: repository root (the build needs the workspace)
- Build command: `pnpm install --frozen-lockfile && pnpm turbo build --filter=@speedy/job-photos`
- Start command: `pnpm --filter @speedy/job-photos start`
- Watch paths: `apps/job-photos/**`, `packages/**`, `pnpm-lock.yaml`
- Health check path: `/`
- Env vars: everything in `.env.example`, plus `PORT` (Railway sets it) and `NODE_ENV=production`
- Domain: `job-photos.naplesaiagency.com` (CNAME in Cloudflare to the Railway domain, DNS-only)

`railway.json` in this folder carries the build and start commands; the engineer creates the
service, sets the root directory and config path (`apps/job-photos/railway.json`), the domain and
the env vars.

## Definition of Done (from CLAUDE.md)

- [x] Registry entry in `packages/registry` (status `live` only when the engineer says so)
- [x] `<NaplesFooter />` in the root layout
- [x] Landing page with title, description and Open Graph image
- [x] This README opens with the scope line
- [x] `.env.example` complete
- [x] Playwright test for the one-moment flow on a phone viewport
- [x] RLS on every table, types regenerated
