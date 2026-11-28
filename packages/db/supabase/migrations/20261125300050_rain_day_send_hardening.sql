-- rain-day R3 review fixes.
--   * opt_outs: STOP lives in its own table that owners can read but never write, so deleting and
--     re-importing a customer cannot clear it. customers.opted_out is moved here and dropped.
--   * create_reschedule: daily caps (3 rain days, 1,000 texts per owner per New York day), body
--     length and status checks, and a reason code for skipped rows.
--   * reschedule_messages.provider: a provider id is only unique within its provider.
--   * previously_texted: who already got a text from this owner, without 500 ids in a URL.

-- opt_outs ----------------------------------------------------------------------------------
create table rain_day.opt_outs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  phone text not null check (phone ~ '^\+1[2-9][0-9]{9}$'),
  opted_out_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, phone)
);

comment on table rain_day.opt_outs is 'Rain Day: numbers that texted STOP. Written only by the server (STOP and START); owners can read their own.';

create index opt_outs_phone_idx on rain_day.opt_outs (phone);

create trigger opt_outs_set_updated_at
  before update on rain_day.opt_outs
  for each row execute function public.set_updated_at();

alter table rain_day.opt_outs enable row level security;

create policy "opt_outs: owners select own"
  on rain_day.opt_outs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "opt_outs: owners cannot insert"
  on rain_day.opt_outs for insert to authenticated with check (false);
create policy "opt_outs: owners cannot update"
  on rain_day.opt_outs for update to authenticated using (false) with check (false);
create policy "opt_outs: owners cannot delete"
  on rain_day.opt_outs for delete to authenticated using (false);

revoke all on rain_day.opt_outs from anon;
revoke insert, update, delete on rain_day.opt_outs from authenticated;
grant select on rain_day.opt_outs to authenticated;
grant all on rain_day.opt_outs to service_role;

insert into rain_day.opt_outs (owner_id, phone, opted_out_at)
  select owner_id, phone, updated_at from rain_day.customers where opted_out
  on conflict (owner_id, phone) do nothing;

alter table rain_day.customers drop column opted_out;

-- reschedule_messages.provider -----------------------------------------------------------------
alter table rain_day.reschedule_messages add column provider text;

update rain_day.reschedule_messages
  set provider = case when provider_message_id like 'FAKE%' then 'fake' else 'twilio' end
  where provider_message_id is not null;

alter table rain_day.reschedule_messages
  add constraint reschedule_messages_provider_check
  check (provider_message_id is null or provider is not null);

-- One real provider message id belongs to one row. The fake provider restarts its ids at
-- FAKE0001 on every boot, so it is left out.
create unique index reschedule_messages_provider_message_key
  on rain_day.reschedule_messages (provider, provider_message_id)
  where provider_message_id is not null and provider <> 'fake';

-- create_reschedule -------------------------------------------------------------------------
create or replace function rain_day.create_reschedule(
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
  v_day_start timestamptz :=
    date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
  v_planned integer;
  v_today integer;
begin
  if v_owner is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) = 0 then
    raise exception 'no messages' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_messages)
      as m (customer_id uuid, customer_name text, body text, status text, error_code text)
    where m.status is null or m.status not in ('queued', 'skipped')
      or m.body is null or char_length(m.body) not between 1 and 480
      or m.customer_name is null or m.customer_id is null
      or (m.error_code is not null and m.error_code not in ('non_us', 'opted_out'))
  ) then
    raise exception 'invalid_message' using errcode = '22023';
  end if;

  -- One send at a time per owner, so the caps and the double-tap check cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('rain_day.send:' || v_owner::text, 0));

  select r.id into v_id from rain_day.reschedules r
    where r.owner_id = v_owner and r.idempotency_key = p_idempotency_key;
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  if (select count(*) from rain_day.reschedules r
        where r.owner_id = v_owner and r.created_at >= v_day_start) >= 3 then
    raise exception 'daily_limit_rain_days' using errcode = 'P0001';
  end if;
  select count(*) into v_planned
    from jsonb_to_recordset(p_messages) as m (status text) where m.status = 'queued';
  select count(*) into v_today
    from rain_day.reschedule_messages m
    join rain_day.reschedules r on r.id = m.reschedule_id
    where r.owner_id = v_owner and r.created_at >= v_day_start and m.status <> 'skipped';
  if v_today + v_planned > 1000 then
    raise exception 'daily_limit_messages' using errcode = 'P0001';
  end if;

  insert into rain_day.reschedules (owner_id, from_date, to_date, template, idempotency_key)
  values (v_owner, p_from_date, p_to_date, p_template, p_idempotency_key)
  returning id into v_id;

  insert into rain_day.reschedule_messages
    (reschedule_id, customer_id, customer_name, body, status, error_code)
  select v_id, m.customer_id, m.customer_name, m.body, m.status, m.error_code
  from jsonb_to_recordset(p_messages)
    as m (customer_id uuid, customer_name text, body text, status text, error_code text);

  return query select v_id, true;
end;
$$;

-- previously_texted -----------------------------------------------------------------------------
-- Customers in this rain day who already got a text from an earlier one (the opt-out line goes on
-- the first text only). Runs as the caller, so RLS limits it to their own rows.
create function rain_day.previously_texted(p_reschedule_id uuid)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct earlier.customer_id
  from rain_day.reschedule_messages current
  join rain_day.reschedule_messages earlier on earlier.customer_id = current.customer_id
  where current.reschedule_id = p_reschedule_id
    and earlier.reschedule_id <> p_reschedule_id
    and earlier.status in ('sent', 'delivered', 'replied');
$$;

revoke all on function rain_day.previously_texted(uuid) from public, anon;
grant execute on function rain_day.previously_texted(uuid) to authenticated, service_role;
