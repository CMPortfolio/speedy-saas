-- rain_day.customers: an owner's customer list with each customer's usual service day.
-- Owners see only their own rows. Later migrations add reschedules and reschedule_messages.

create table rain_day.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  -- E.164 US number: +1 then ten digits. Apps normalise with @speedy/lib/phone before writing.
  phone text not null check (phone ~ '^\+1[2-9][0-9]{9}$'),
  -- 0 = Sunday … 6 = Saturday, the same numbering as JavaScript's Date#getDay().
  service_day smallint not null check (service_day between 0 and 6),
  note text check (note is null or char_length(note) <= 500),
  opted_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, phone)
);

comment on table rain_day.customers is 'Rain Day: one row per customer an owner texts when a day is rained out.';

create index customers_owner_id_service_day_idx on rain_day.customers (owner_id, service_day);

create trigger customers_set_updated_at
  before update on rain_day.customers
  for each row execute function public.set_updated_at();

alter table rain_day.customers enable row level security;

create policy "customers: owners select own"
  on rain_day.customers for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "customers: owners insert own"
  on rain_day.customers for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "customers: owners update own"
  on rain_day.customers for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "customers: owners delete own"
  on rain_day.customers for delete to authenticated
  using (owner_id = (select auth.uid()));

-- The init migration's default privileges already cover new tables; stated here so the grant is
-- visible next to the policies.
grant all on rain_day.customers to anon, authenticated, service_role;
