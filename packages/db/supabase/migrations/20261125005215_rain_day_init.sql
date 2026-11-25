-- rain-day: first migration. Tables for this tool live in schema "rain_day".
-- Every table: id, created_at, updated_at (timestamptz), RLS on, one policy per operation.
-- Expose the schema to the API (api.schemas in packages/db/supabase/config.jsonc) when you add
-- the first table, then run pnpm db:types.

create schema if not exists rain_day;
grant usage on schema rain_day to anon, authenticated, service_role;
alter default privileges in schema rain_day grant all on tables to anon, authenticated, service_role;
alter default privileges in schema rain_day grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema rain_day grant execute on functions to anon, authenticated, service_role;
