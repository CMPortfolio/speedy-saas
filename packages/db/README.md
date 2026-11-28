# @speedy/db

Migrations, generated types and helpers for the one Supabase project every Speedy SaaS tool shares.

## What's here

- `supabase/migrations/` – every migration in the repo, in order. Core tables first (`20261125000000_core.sql`), then one migration per tool change.
- `supabase/config.jsonc` – local Supabase config (`supabase start` from this folder).
- `src/database.types.ts` – generated types. Apps import `Database` from `@speedy/db/types`.
- `src/core.ts` – typed helpers for the core tables (`getProfile`, `updateProfile`, `recordToolUsage`, `leaveFeedback`).
- `src/schemas.ts` – Zod schemas for core rows.
- `tests/harness.ts` – the database test harness (`@speedy/db/testing`) every RLS test uses.

## Core tables (schema `public`)

`profiles`, `organizations`, `memberships`, `tool_usage`, `feedback`. Every table has `id`, `created_at`, `updated_at` (timestamptz), RLS on, and one policy per operation. A trigger creates a `profiles` row for every new auth user. Changing a core table needs the engineer's approval in the plan (CLAUDE.md rule 6).

## Running the database locally

Two options:

1. **Supabase CLI** (full stack with Auth and Storage): `cd packages/db && supabase start`, then `supabase db reset` applies the migrations. Needs Docker and access to Supabase's image registry.
2. **Plain Postgres** (what CI uses): `pnpm --filter @speedy/db db:start` runs `postgres:17-alpine` on port 54322, then `pnpm --filter @speedy/db db:reset` applies `tests/supabase-shim.sql` (roles, `auth.users`, `auth.uid()`) and every migration. The shim is a no-op on a real Supabase database.

RLS tests connect to `DATABASE_URL` (default `postgresql://postgres:postgres@127.0.0.1:54322/postgres`). They run when `CI`, `DATABASE_URL` or `DB_TESTS=1` is set and skip with a warning otherwise.

## Adding a tool's own tables

Each tool's tables live in a Postgres schema named after the tool slug with underscores (`job_photos`, `missed_call`, `rain_day`). `pnpm new-tool <slug>` creates the empty migration for you; otherwise:

1. Create `supabase/migrations/<YYYYMMDDHHMMSS>_<slug>_<what>.sql`.
2. Start with the schema and grants:

   ```sql
   create schema if not exists my_tool;
   grant usage on schema my_tool to anon, authenticated, service_role;
   alter default privileges in schema my_tool grant all on tables to anon, authenticated, service_role;
   alter default privileges in schema my_tool grant all on sequences to anon, authenticated, service_role;
   ```

3. Every table: `id uuid primary key default gen_random_uuid()`, `created_at`/`updated_at timestamptz not null default now()`, the `public.set_updated_at()` trigger, `enable row level security`, and a policy per operation (`select`, `insert`, `update`, `delete`). Owners see only their own rows: `owner_id = (select auth.uid())`.
4. Expose the schema to PostgREST: add it to `api.schemas` in `supabase/config.jsonc` (local) and in the hosted project's API settings (Chris). Apps then call `supabase.schema('my_tool').from('table')`.
5. `pnpm db:types` (or `db:types:remote`), commit the types.
6. Add an RLS test under the app's `tests/` using `@speedy/db/testing` proving user A can't read user B's rows.

## Production

Migrations are applied to the hosted project by the engineer (`supabase db push` with the project linked). Claude never runs migrations against production.
