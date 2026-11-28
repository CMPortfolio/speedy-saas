-- missed-call: first migration. Tables for this tool live in schema "missed_call".
-- Every table: id, created_at, updated_at (timestamptz), RLS on, one policy per operation.
-- Expose the schema to the API (api.schemas in packages/db/supabase/config.jsonc) when you add
-- the first table, then run pnpm db:types.

create schema if not exists missed_call;
grant usage on schema missed_call to anon, authenticated, service_role;
alter default privileges in schema missed_call grant all on tables to anon, authenticated, service_role;
alter default privileges in schema missed_call grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema missed_call grant execute on functions to anon, authenticated, service_role;
