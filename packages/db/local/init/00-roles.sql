-- Roles and settings the Supabase services expect. Mirrors the supabase/postgres image.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'postgres';
grant anon, authenticated, service_role to authenticator;

create role supabase_auth_admin login createrole noinherit password 'postgres';
create role supabase_storage_admin login createrole noinherit password 'postgres';
alter role supabase_auth_admin set search_path = auth;
alter role supabase_storage_admin set search_path = storage;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role, supabase_auth_admin, supabase_storage_admin;

create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists storage authorization supabase_storage_admin;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant usage on schema storage to anon, authenticated, service_role, postgres;
grant all on schema storage to supabase_storage_admin;
grant create on database postgres to supabase_auth_admin, supabase_storage_admin;

alter database postgres set "app.settings.jwt_secret" to 'super-secret-jwt-token-with-at-least-32-characters-long';
alter database postgres set "app.settings.jwt_exp" to '3600';
alter role authenticator set statement_timeout = '8s';

-- Tool schemas exist from the start so PostgREST can load its schema cache; each tool's
-- migration adds the tables.
create schema if not exists job_photos;
create schema if not exists missed_call;
create schema if not exists rain_day;
grant usage on schema job_photos, missed_call, rain_day to anon, authenticated, service_role;

-- Tables the Storage API creates later get the same grants the supabase/postgres image gives.
alter default privileges for role supabase_storage_admin in schema storage grant all on tables to anon, authenticated, service_role, postgres;
alter default privileges for role supabase_storage_admin in schema storage grant all on sequences to anon, authenticated, service_role, postgres;
alter default privileges for role supabase_storage_admin in schema storage grant execute on functions to anon, authenticated, service_role, postgres;
alter default privileges for role supabase_auth_admin in schema auth grant select on tables to postgres, service_role;
alter role supabase_storage_admin bypassrls;

-- The Auth and Storage services switch to the request's JWT role with SET ROLE.
grant anon, authenticated, service_role to supabase_auth_admin, supabase_storage_admin;
