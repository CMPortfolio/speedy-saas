When weather wipes out a day, the owner picks the day, picks the new day, and every affected customer gets one personal text about the change. It won't be a route planner, a scheduling system or a weather app.

# Rain Day

Speedy SaaS tool `rain-day`. Lives at `https://rain-day.naplesaiagency.com`. Tickets: [R1 scaffold](https://app.clickup.com/t/1dfc7p9xnj1), [R2 settings and customers](https://app.clickup.com/t/1dfc7p9xnj2), [R3 send flow](https://app.clickup.com/t/1dfc7p9xnj3), [R4 replies](https://app.clickup.com/t/1dfc7p9xnj4), [R5 landing page and end-to-end](https://app.clickup.com/t/1dfc7p9xnj5).

The moment: 2 PM, a storm parks over the route, 14 Tuesday customers get their own text in one
tap. Sign-in is required because the tool keeps customer phone numbers.

## Run it

```bash
cp apps/rain-day/.env.example apps/rain-day/.env.local   # fill in the shared Supabase values
pnpm dev --filter @speedy/rain-day                        # http://localhost:3003
pnpm turbo run typecheck lint test --filter @speedy/rain-day...
pnpm test:e2e --filter @speedy/rain-day                   # builds, starts, runs Playwright on a phone viewport
```

`pnpm test:e2e` needs the local Supabase stack (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` in the environment). It starts the app with the fake SMS provider
(`SMS_PROVIDER=fake`, `ALLOW_FAKE_SMS=1`, set by `playwright.config.ts` for that run only), signs in with a
magic-link token, imports `tests/fixtures/customers.csv`, runs a rain day and checks the sends.

The RLS tests under `tests/unit/` run against `DATABASE_URL` when `DB_TESTS=1` (or in CI) and skip
otherwise. Start a database with `pnpm --filter @speedy/db db:start && pnpm --filter @speedy/db db:reset`.

## What's here (R1–R2)

- `/` landing; Start goes to `/sign-in?next=/customers`.
- `/settings` business name and owner cell, stored on `public.profiles` (`business_name`, `phone`
  as E.164) through `updateProfile` from `@speedy/db/core`.
- `/customers` the list (`CustomerList` from `@speedy/ui/customer-list`), add, edit, remove.
- `/customers/import` paste a list (`Name, phone, day[, note]`, commas/tabs/semicolons) or choose a
  CSV (header row optional, columns found by name). The preview shows what will be imported and
  what will be skipped with the reason, then one Import button. "Pick from phone contacts" shows
  only on browsers with the Contact Picker API. UI and parsing come from `@speedy/ui/csv-import`
  and `@speedy/ui/csv`; this app only supplies the phone and weekday rules.
- Later: `/rain-day` pick the day and the new day, send (R3+), once `@speedy/sms` exists.

## Layout

```
src/app/        routes: landing (/), sign-in, auth/callback, customers, customers/new,
                customers/[id]/edit, customers/import, settings, opengraph-image
src/components/ button-link, contacts-picker-button (client only, no server imports)
src/features/   customers (schema, queries, server actions, forms), settings (action, form)
src/lib/        weekday parsing and names, form-state helpers and the shared phone field
tests/          smoke.spec.ts (Playwright); tests/unit for Vitest incl. the RLS test
tool.config.ts  slug, name, scope line, schema, dev port, URL
```

## Database

Tables live in the Postgres schema `rain_day` in the shared Supabase project.

- `rain_day.customers` (R2): `id`, `owner_id`, `name`, `phone` (E.164, unique per owner),
  `service_day` (0 = Sunday … 6 = Saturday), `note`, `opted_out`, timestamps. RLS: one policy per
  operation, `owner_id = (select auth.uid())`. Index on `(owner_id, service_day)`.
- Later: `reschedules`, `reschedule_messages`.

Migrations: `packages/db/supabase/migrations/*_rain_day_*.sql`. Types are in
`packages/db/src/database.types.ts` (`Database['rain_day']`); regenerate with `pnpm db:types`
once the hosted project has the schema. The schema is exposed in `api.schemas` of
`packages/db/supabase/config.jsonc`; the hosted project's API settings need the same.

## Deploy (Railway, one service per tool)

- Root directory: repository root (the build needs the workspace)
- Build command: `pnpm install --frozen-lockfile && pnpm turbo build --filter=@speedy/rain-day`
- Start command: `pnpm --filter @speedy/rain-day start`
- Watch paths: `apps/rain-day/**`, `packages/**`, `pnpm-lock.yaml`
- Health check path: `/`
- Env vars: everything in `.env.example`, plus `PORT` (Railway sets it) and `NODE_ENV=production`
- Domain: `rain-day.naplesaiagency.com` (CNAME in Cloudflare to the Railway domain, DNS-only)

`railway.json` in this folder carries the build and start commands; the engineer creates the
service, sets the root directory and config path (`apps/rain-day/railway.json`), the domain and
the env vars.

## Definition of Done (from CLAUDE.md)

- [x] Registry entry in `packages/registry` (status `live` only when the engineer says so)
- [x] `<NaplesFooter />` in the root layout
- [x] Landing page with title, description and Open Graph image
- [x] This README opens with the scope line
- [x] `.env.example` complete
- [x] Playwright test on a phone viewport (smoke + sign-in redirects; one-moment flow from R3)
- [x] RLS on every table, types updated by hand until `pnpm db:types` can run
