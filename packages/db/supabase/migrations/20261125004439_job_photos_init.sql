-- job-photos: first migration. Tables for this tool live in schema "job_photos".
-- Every table: id, created_at, updated_at (timestamptz), RLS on, one policy per operation.
-- Expose the schema to the API (api.schemas in packages/db/supabase/config.jsonc) when you add
-- the first table, then run pnpm db:types.

create schema if not exists job_photos;
grant usage on schema job_photos to anon, authenticated, service_role;
alter default privileges in schema job_photos grant all on tables to anon, authenticated, service_role;
alter default privileges in schema job_photos grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema job_photos grant execute on functions to anon, authenticated, service_role;
