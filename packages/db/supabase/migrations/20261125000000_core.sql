-- Core tables shared by every Speedy SaaS tool. Changes here need the engineer's approval
-- (CLAUDE.md rule 6). Each tool's own tables live in a schema named after the tool.

create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is 'Trigger: keeps updated_at current on every row change.';

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  business_name text,
  trade text,
  city text,
  phone text,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per signed-in owner. Created by trigger on auth.users insert.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: owners select own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: owners insert own"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles: owners update own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "profiles: owners delete own"
  on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

-- Create the profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- organizations and memberships: for tools a crew or office shares
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create type public.membership_role as enum ('owner', 'member');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_organization_id_idx on public.memberships (organization_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- Is the current user a member (any role) of the organization? Security definer so RLS on
-- memberships can call it without recursing into itself.
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Does the organization have any members yet? Security definer so the memberships insert policy
-- can ask without recursing into its own RLS.
create or replace function public.org_has_members(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (select 1 from public.memberships m where m.organization_id = org_id);
$$;

alter table public.organizations enable row level security;

-- The creator can see the row right after insert (needed for RETURNING), then members.
create policy "organizations: members or creator select"
  on public.organizations for select to authenticated
  using (public.is_org_member(id) or created_by = (select auth.uid()));

create policy "organizations: creator insert"
  on public.organizations for insert to authenticated
  with check ((select auth.uid()) = created_by);

create policy "organizations: owners update"
  on public.organizations for update to authenticated
  using (public.is_org_owner(id))
  with check (public.is_org_owner(id));

create policy "organizations: owners delete"
  on public.organizations for delete to authenticated
  using (public.is_org_owner(id));

alter table public.memberships enable row level security;

create policy "memberships: members select"
  on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_member(organization_id));

-- The creator becomes the first owner; after that only owners add members.
create policy "memberships: owners or creator insert"
  on public.memberships for insert to authenticated
  with check (
    public.is_org_owner(organization_id)
    or (
      user_id = (select auth.uid())
      and role = 'owner'
      and exists (
        select 1 from public.organizations o
        where o.id = organization_id and o.created_by = (select auth.uid())
      )
      and not public.org_has_members(organization_id)
    )
  );

create policy "memberships: owners update"
  on public.memberships for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

create policy "memberships: owners or self delete"
  on public.memberships for delete to authenticated
  using (public.is_org_owner(organization_id) or user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- tool_usage: which user has used which tool, and when
-- ---------------------------------------------------------------------------
create table public.tool_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tool_slug text not null,
  first_used_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  uses integer not null default 1 check (uses >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tool_slug)
);

create trigger tool_usage_set_updated_at
  before update on public.tool_usage
  for each row execute function public.set_updated_at();

alter table public.tool_usage enable row level security;

create policy "tool_usage: owners select own"
  on public.tool_usage for select to authenticated
  using (user_id = (select auth.uid()));

create policy "tool_usage: owners insert own"
  on public.tool_usage for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "tool_usage: owners update own"
  on public.tool_usage for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "tool_usage: owners delete own"
  on public.tool_usage for delete to authenticated
  using (user_id = (select auth.uid()));

-- One call from any tool: insert or bump the row for the current user.
create or replace function public.record_tool_usage(slug text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.tool_usage (user_id, tool_slug)
  values ((select auth.uid()), slug)
  on conflict (user_id, tool_slug)
  do update set uses = public.tool_usage.uses + 1, last_used_at = now();
$$;

-- ---------------------------------------------------------------------------
-- feedback: one-tap "did this help?" per tool
-- ---------------------------------------------------------------------------
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  tool_slug text not null,
  helped boolean not null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_tool_slug_idx on public.feedback (tool_slug, created_at desc);

create trigger feedback_set_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

alter table public.feedback enable row level security;

-- Anyone may leave feedback (anonymous rows have user_id null); signed-in users own theirs.
create policy "feedback: anyone insert"
  on public.feedback for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

create policy "feedback: owners select own"
  on public.feedback for select to authenticated
  using (user_id = (select auth.uid()));

create policy "feedback: owners update own"
  on public.feedback for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "feedback: owners delete own"
  on public.feedback for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants: PostgREST roles need table access; RLS does the rest.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
