SCOPE LINE: what this tool does for an owner, and what it won't do. (Replace this line first; it is the tool's one-line scope and is copied into `tool.config.ts`.)

# **NAME**

Speedy SaaS tool `__SLUG__`. Lives at `https://__SLUG__.naplesaiagency.com`. Ticket: <!-- ClickUp link -->.

## Run it

```bash
cp apps/__SLUG__/.env.example apps/__SLUG__/.env.local   # fill in the shared Supabase values
pnpm dev --filter @speedy/__SLUG__                        # http://localhost:__PORT__
pnpm turbo run typecheck lint test --filter @speedy/__SLUG__...
pnpm test:e2e --filter @speedy/__SLUG__                   # builds, starts, runs Playwright on a phone viewport
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

## Database

This tool's tables live in the Postgres schema `__SCHEMA__` in the shared Supabase project.
Migrations go in `packages/db/supabase/migrations/` (one was created with the scaffold). Every
table has RLS with a policy per operation. After a migration run `pnpm db:types` and commit.
Expose the schema to the API: `api.schemas` in `packages/db/supabase/config.jsonc` locally and
the hosted project's API settings in production.

## Deploy (Railway, one service per tool)

- Root directory: repository root (the build needs the workspace)
- Build command: `pnpm install --frozen-lockfile && pnpm turbo build --filter=@speedy/__SLUG__`
- Start command: `pnpm --filter @speedy/__SLUG__ start`
- Watch paths: `apps/__SLUG__/**`, `packages/**`, `pnpm-lock.yaml`
- Health check path: `/`
- Env vars: everything in `.env.example`, plus `PORT` (Railway sets it) and `NODE_ENV=production`
- Domain: `__SLUG__.naplesaiagency.com` (CNAME in Cloudflare to the Railway domain, DNS-only)

`railway.json` in this folder carries the build and start commands; the engineer creates the
service, sets the root directory and config path (`apps/__SLUG__/railway.json`), the domain and
the env vars.

## Definition of Done (from CLAUDE.md)

- [ ] Registry entry in `packages/registry` (status `live` only when the engineer says so)
- [ ] `<NaplesFooter />` in the root layout
- [ ] Landing page with title, description and Open Graph image
- [ ] This README opens with the scope line
- [ ] `.env.example` complete
- [ ] Playwright test for the one-moment flow on a phone viewport
- [ ] RLS on every table, types regenerated
