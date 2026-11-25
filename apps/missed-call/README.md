When an owner misses a call while on a job, the caller gets a text within seconds asking what they need, and the owner sees the reply in one list. It won't be a phone system, answering service, AI receptionist or CRM.

# **NAME**

Speedy SaaS tool `missed-call`. Lives at `https://missed-call.naplesaiagency.com`. Ticket: [Missed-call M1: scaffold the missed-call app](https://app.clickup.com/t/1dfc7p9xnhv).

## Run it

```bash
cp apps/missed-call/.env.example apps/missed-call/.env.local   # fill in the shared Supabase values
pnpm dev --filter @speedy/missed-call                        # http://localhost:3002
pnpm turbo run typecheck lint test --filter @speedy/missed-call...
pnpm test:e2e --filter @speedy/missed-call                   # builds, starts, runs Playwright on a phone viewport
```

## Webhooks

`POST /api/voice/incoming` is the only provider webhook so far. Point the Twilio number's "A call comes in" and "Call status changes" at it (see `packages/sms/README.md`). Each request is checked against Twilio's signature first; a bad or missing one gets a 403 and nothing is read or written. A call that rings (direct, or forwarded by the owner's no-answer forwarding) is logged as missed, the caller gets the owner's template (the after-hours one outside the line's quiet hours, America/New_York unless the line says otherwise), then a short spoken greeting. The same caller is texted at most once in 24 hours, blocked numbers never, and a retried webhook never twice. Locally `SMS_PROVIDER=fake` sends nothing.

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

This tool's tables live in the Postgres schema `missed_call` in the shared Supabase project.
Migrations go in `packages/db/supabase/migrations/` (one was created with the scaffold). Every
table has RLS with a policy per operation. After a migration run `pnpm db:types` and commit.
Expose the schema to the API: `api.schemas` in `packages/db/supabase/config.jsonc` locally and
the hosted project's API settings in production.

## Deploy (Railway, one service per tool)

- Root directory: repository root (the build needs the workspace)
- Build command: `pnpm install --frozen-lockfile && pnpm turbo build --filter=@speedy/missed-call`
- Start command: `pnpm --filter @speedy/missed-call start`
- Watch paths: `apps/missed-call/**`, `packages/**`, `pnpm-lock.yaml`
- Health check path: `/`
- Env vars: everything in `.env.example`, plus `PORT` (Railway sets it) and `NODE_ENV=production`
- Domain: `missed-call.naplesaiagency.com` (CNAME in Cloudflare to the Railway domain, DNS-only)

`railway.json` in this folder carries the build and start commands; the engineer creates the
service, sets the root directory and config path (`apps/missed-call/railway.json`), the domain and
the env vars.

## Definition of Done (from CLAUDE.md)

- [ ] Registry entry in `packages/registry` (status `live` only when the engineer says so)
- [ ] `<NaplesFooter />` in the root layout
- [ ] Landing page with title, description and Open Graph image
- [ ] This README opens with the scope line
- [ ] `.env.example` complete
- [ ] Playwright test for the one-moment flow on a phone viewport
- [ ] RLS on every table, types regenerated
