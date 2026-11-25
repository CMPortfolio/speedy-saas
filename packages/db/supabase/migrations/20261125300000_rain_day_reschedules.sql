-- rain_day.reschedules and rain_day.reschedule_messages: one row per rain day the owner sends,
-- and one row per customer text inside it.
--
-- Owners can read their own sends and create them (through rain_day.create_reschedule, which
-- runs as the caller so RLS applies). Owners cannot edit or delete sends: status changes come
-- from the provider's delivery webhook and the send step, both server-side with the service role.

create table rain_day.reschedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  -- The message as the owner edited it, with {first_name} and {new_day} still in it.
  template text not null check (char_length(template) between 1 and 1000),
  -- Made by the browser when the form opens. A double tap or a retry carries the same key,
  -- so it finds the existing send instead of making a second one.
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_date <> from_date),
  unique (owner_id, idempotency_key)
);

comment on table rain_day.reschedules is 'Rain Day: one row per rain day an owner sent.';

create index reschedules_owner_id_created_at_idx on rain_day.reschedules (owner_id, created_at desc);

create trigger reschedules_set_updated_at
  before update on rain_day.reschedules
  for each row execute function public.set_updated_at();

create table rain_day.reschedule_messages (
  id uuid primary key default gen_random_uuid(),
  reschedule_id uuid not null references rain_day.reschedules (id) on delete cascade,
  -- Kept (as null) if the owner later removes the customer; the name below still shows in history.
  customer_id uuid references rain_day.customers (id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  -- This customer's own text, already filled in. Never contains another customer's details.
  body text not null check (char_length(body) between 1 and 1600),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'failed', 'replied', 'skipped')),
  provider_message_id text,
  -- Short provider error code when a text failed, for example '30003'. Never a message body.
  error_code text check (error_code is null or char_length(error_code) <= 40),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One text per customer per rain day.
  unique (reschedule_id, customer_id)
);

comment on table rain_day.reschedule_messages is 'Rain Day: one row per customer text in a rain day. skipped = opted out, nothing sent.';

-- Delivery webhooks find their message by the provider's id. Not unique on purpose: the fake
-- provider used in development restarts its ids at FAKE0001.
create index reschedule_messages_provider_message_id_idx
  on rain_day.reschedule_messages (provider_message_id) where provider_message_id is not null;
create index reschedule_messages_customer_id_idx on rain_day.reschedule_messages (customer_id, created_at desc);

create trigger reschedule_messages_set_updated_at
  before update on rain_day.reschedule_messages
  for each row execute function public.set_updated_at();

alter table rain_day.reschedules enable row level security;
alter table rain_day.reschedule_messages enable row level security;

-- reschedules: owners read and create their own. No update, no delete.
create policy "reschedules: owners select own"
  on rain_day.reschedules for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "reschedules: owners insert own"
  on rain_day.reschedules for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "reschedules: owners cannot update"
  on rain_day.reschedules for update to authenticated
  using (false) with check (false);

create policy "reschedules: owners cannot delete"
  on rain_day.reschedules for delete to authenticated
  using (false);

-- reschedule_messages: owners read the texts of their own rain days and create them only for
-- their own rain days and their own customers, as queued or skipped. No update, no delete.
create policy "reschedule_messages: owners select own"
  on rain_day.reschedule_messages for select to authenticated
  using (
    exists (
      select 1 from rain_day.reschedules r
      where r.id = reschedule_messages.reschedule_id and r.owner_id = (select auth.uid())
    )
  );

create policy "reschedule_messages: owners insert own"
  on rain_day.reschedule_messages for insert to authenticated
  with check (
    status in ('queued', 'skipped')
    and provider_message_id is null
    and exists (
      select 1 from rain_day.reschedules r
      where r.id = reschedule_messages.reschedule_id and r.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from rain_day.customers c
      where c.id = reschedule_messages.customer_id and c.owner_id = (select auth.uid())
    )
  );

create policy "reschedule_messages: owners cannot update"
  on rain_day.reschedule_messages for update to authenticated
  using (false) with check (false);

create policy "reschedule_messages: owners cannot delete"
  on rain_day.reschedule_messages for delete to authenticated
  using (false);

-- Least privilege on top of the policies. Anonymous callers get nothing at all.
revoke all on rain_day.reschedules, rain_day.reschedule_messages from anon;
revoke update, delete on rain_day.reschedules, rain_day.reschedule_messages from authenticated;
grant select, insert on rain_day.reschedules, rain_day.reschedule_messages to authenticated;
grant all on rain_day.reschedules, rain_day.reschedule_messages to service_role;

-- create_reschedule: make one rain day and all its message rows in a single transaction, once.
-- Runs as the caller (security invoker), so the policies above decide what may be written.
-- p_messages is a JSON array of { customer_id, customer_name, body, status } where status is
-- 'queued' or 'skipped'. A second call with the same key creates nothing and returns the
-- existing rain day with created = false, so the caller knows not to send again.
create function rain_day.create_reschedule(
  p_idempotency_key uuid,
  p_from_date date,
  p_to_date date,
  p_template text,
  p_messages jsonb
)
returns table (reschedule_id uuid, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) = 0 then
    raise exception 'no messages' using errcode = '22023';
  end if;

  insert into rain_day.reschedules (owner_id, from_date, to_date, template, idempotency_key)
  values (v_owner, p_from_date, p_to_date, p_template, p_idempotency_key)
  on conflict (owner_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select r.id into v_id
    from rain_day.reschedules r
    where r.owner_id = v_owner and r.idempotency_key = p_idempotency_key;
    return query select v_id, false;
    return;
  end if;

  insert into rain_day.reschedule_messages (reschedule_id, customer_id, customer_name, body, status)
  select v_id, m.customer_id, m.customer_name, m.body, m.status
  from jsonb_to_recordset(p_messages)
    as m (customer_id uuid, customer_name text, body text, status text);

  return query select v_id, true;
end;
$$;

comment on function rain_day.create_reschedule is 'Rain Day: create a rain day and its message rows once per idempotency key.';

revoke all on function rain_day.create_reschedule(uuid, date, date, text, jsonb) from public, anon;
grant execute on function rain_day.create_reschedule(uuid, date, date, text, jsonb)
  to authenticated, service_role;
