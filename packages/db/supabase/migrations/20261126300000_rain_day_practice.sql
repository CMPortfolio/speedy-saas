-- rain-day practice mode: an owner with no real texting number yet can try the whole flow on an
-- on-screen phone. Nothing is texted to anyone. Practice data lives in its own tables so it never
-- mixes with real rain days, messages, replies or opt-outs, and never counts against the real
-- daily caps.
--
-- Whether an owner is in practice mode is decided by the server from owner_settings (no real
-- number and Messaging Service). These tables only store what the practice phone shows. Owners
-- can read their own rows; every write is made by the server with the service role.

-- practice_reschedules: one row per practice rain day ("Send as practice").
create table rain_day.practice_reschedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  template text not null check (char_length(template) between 1 and 1000),
  -- Same double-tap protection as a real send.
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_date <> from_date),
  unique (owner_id, idempotency_key)
);

create index practice_reschedules_owner_id_created_at_idx
  on rain_day.practice_reschedules (owner_id, created_at desc);

create trigger practice_reschedules_set_updated_at
  before update on rain_day.practice_reschedules
  for each row execute function public.set_updated_at();

-- practice_messages: every bubble on the practice phone.
--   out      the text a customer would get (status sent, or skipped with a reason)
--   in       what the owner typed while playing the customer
--   forward  the text that would go to the owner's own cell
create table rain_day.practice_messages (
  id uuid primary key default gen_random_uuid(),
  -- The order bubbles were added in. created_at is the same for everything one call adds.
  seq bigint generated always as identity,
  owner_id uuid not null references auth.users (id) on delete cascade,
  practice_reschedule_id uuid not null
    references rain_day.practice_reschedules (id) on delete cascade,
  customer_id uuid references rain_day.customers (id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  direction text not null check (direction in ('out', 'in', 'forward')),
  -- text: the rain-day message. help: the carrier HELP answer. note: a system line such as
  -- "opted out".
  kind text not null default 'text' check (kind in ('text', 'help', 'note')),
  body text not null check (char_length(body) between 1 and 1600),
  status text not null default 'sent'
    check (status in ('sent', 'skipped', 'replied', 'received')),
  error_code text check (error_code is null or char_length(error_code) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index practice_messages_owner_id_seq_idx on rain_day.practice_messages (owner_id, seq);
create index practice_messages_reschedule_idx
  on rain_day.practice_messages (practice_reschedule_id, seq);

create trigger practice_messages_set_updated_at
  before update on rain_day.practice_messages
  for each row execute function public.set_updated_at();

-- practice_opt_outs: a STOP typed on the practice phone. Separate from rain_day.opt_outs, so a
-- practice STOP never blocks a real customer.
create table rain_day.practice_opt_outs (
  owner_id uuid not null references auth.users (id) on delete cascade,
  customer_id uuid not null references rain_day.customers (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, customer_id)
);

create trigger practice_opt_outs_set_updated_at
  before update on rain_day.practice_opt_outs
  for each row execute function public.set_updated_at();

-- practice_actions: one row per practice send or reply, to rate-limit them per owner.
create table rain_day.practice_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index practice_actions_owner_id_created_at_idx
  on rain_day.practice_actions (owner_id, created_at desc);

alter table rain_day.practice_reschedules enable row level security;
alter table rain_day.practice_messages enable row level security;
alter table rain_day.practice_opt_outs enable row level security;
alter table rain_day.practice_actions enable row level security;

-- Owners read their own practice rows. No owner write policy: the server writes.
create policy "practice_reschedules: owners select own"
  on rain_day.practice_reschedules for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "practice_reschedules: owners cannot insert"
  on rain_day.practice_reschedules for insert to authenticated with check (false);
create policy "practice_reschedules: owners cannot update"
  on rain_day.practice_reschedules for update to authenticated using (false) with check (false);
create policy "practice_reschedules: owners cannot delete"
  on rain_day.practice_reschedules for delete to authenticated using (false);

create policy "practice_messages: owners select own"
  on rain_day.practice_messages for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "practice_messages: owners cannot insert"
  on rain_day.practice_messages for insert to authenticated with check (false);
create policy "practice_messages: owners cannot update"
  on rain_day.practice_messages for update to authenticated using (false) with check (false);
create policy "practice_messages: owners cannot delete"
  on rain_day.practice_messages for delete to authenticated using (false);

create policy "practice_opt_outs: owners select own"
  on rain_day.practice_opt_outs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "practice_opt_outs: owners cannot insert"
  on rain_day.practice_opt_outs for insert to authenticated with check (false);
create policy "practice_opt_outs: owners cannot update"
  on rain_day.practice_opt_outs for update to authenticated using (false) with check (false);
create policy "practice_opt_outs: owners cannot delete"
  on rain_day.practice_opt_outs for delete to authenticated using (false);

create policy "practice_actions: no owner access"
  on rain_day.practice_actions for all to authenticated using (false) with check (false);

revoke all on rain_day.practice_reschedules, rain_day.practice_messages,
  rain_day.practice_opt_outs, rain_day.practice_actions from anon;
revoke all on rain_day.practice_actions from authenticated;
revoke insert, update, delete on rain_day.practice_reschedules, rain_day.practice_messages,
  rain_day.practice_opt_outs from authenticated;
grant select on rain_day.practice_reschedules, rain_day.practice_messages,
  rain_day.practice_opt_outs to authenticated;
grant all on rain_day.practice_reschedules, rain_day.practice_messages,
  rain_day.practice_opt_outs, rain_day.practice_actions to service_role;

-- reserve_practice_action: count this owner's practice actions in the window and record one, or
-- refuse. The advisory lock makes two requests at once take turns.
create function rain_day.reserve_practice_action(
  p_owner_id uuid, p_limit integer, p_window_seconds integer
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('rain_day.practice:' || p_owner_id::text, 0));
  delete from rain_day.practice_actions
    where owner_id = p_owner_id and created_at < now() - interval '1 day';
  select count(*) into v_count from rain_day.practice_actions
    where owner_id = p_owner_id and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into rain_day.practice_actions (owner_id) values (p_owner_id);
  return true;
end;
$$;

-- create_practice_reschedule: make one practice rain day and its 'out' bubbles, once per key.
-- p_messages is a JSON array of { customer_id, customer_name, body, status, error_code } where
-- status is 'sent' or 'skipped'. An owner's practice phone holds at most p_max_messages bubbles,
-- so practice cannot be used to fill the database: over that it raises practice_full and the owner
-- clears practice first.
create function rain_day.create_practice_reschedule(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_from_date date,
  p_to_date date,
  p_template text,
  p_messages jsonb,
  p_max_messages integer
)
returns table (reschedule_id uuid, created boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer;
begin
  if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) = 0 then
    raise exception 'no messages' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_messages)
      as m (customer_id uuid, customer_name text, body text, status text, error_code text)
    where m.status is null or m.status not in ('sent', 'skipped')
      or m.body is null or char_length(m.body) not between 1 and 480
      or m.customer_name is null or m.customer_id is null
      or (m.error_code is not null and m.error_code not in ('non_us', 'opted_out'))
  ) then
    raise exception 'invalid_message' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rain_day.practice_send:' || p_owner_id::text, 0));

  select r.id into v_id from rain_day.practice_reschedules r
    where r.owner_id = p_owner_id and r.idempotency_key = p_idempotency_key;
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  select count(*) into v_count from rain_day.practice_messages where owner_id = p_owner_id;
  if v_count + jsonb_array_length(p_messages) > p_max_messages then
    raise exception 'practice_full' using errcode = 'P0001';
  end if;

  insert into rain_day.practice_reschedules (owner_id, from_date, to_date, template, idempotency_key)
  values (p_owner_id, p_from_date, p_to_date, p_template, p_idempotency_key)
  returning id into v_id;

  insert into rain_day.practice_messages
    (owner_id, practice_reschedule_id, customer_id, customer_name, direction, body, status, error_code)
  select p_owner_id, v_id, m.customer_id, m.customer_name, 'out', m.body, m.status, m.error_code
  from jsonb_to_recordset(p_messages)
    as m (customer_id uuid, customer_name text, body text, status text, error_code text);

  return query select v_id, true;
end;
$$;

-- add_practice_rows: file the bubbles that follow from something the owner did on the practice
-- phone (a reply typed as the customer, the forward to their cell, a HELP answer), in one
-- transaction and under the same cap.
-- p_rows is a JSON array of { direction, kind, body, status, error_code } for one customer in one
-- practice rain day; p_mark_replied also flips that customer's 'out' bubble to 'replied'.
create function rain_day.add_practice_rows(
  p_owner_id uuid,
  p_reschedule_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_rows jsonb,
  p_mark_replied boolean,
  p_max_messages integer
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_added integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'no rows' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_rows)
      as m (direction text, kind text, body text, status text, error_code text)
    where m.direction is null or m.direction not in ('out', 'in', 'forward')
      or m.kind is null or m.kind not in ('text', 'help', 'note')
      or m.status is null or m.status not in ('sent', 'replied', 'received')
      or m.body is null or char_length(m.body) not between 1 and 1600
  ) then
    raise exception 'invalid_row' using errcode = '22023';
  end if;
  if not exists (
    select 1 from rain_day.practice_reschedules r
    where r.id = p_reschedule_id and r.owner_id = p_owner_id
  ) then
    raise exception 'unknown practice rain day' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rain_day.practice_send:' || p_owner_id::text, 0));

  select count(*) into v_count from rain_day.practice_messages where owner_id = p_owner_id;
  v_added := jsonb_array_length(p_rows);
  if v_count + v_added > p_max_messages then
    raise exception 'practice_full' using errcode = 'P0001';
  end if;

  insert into rain_day.practice_messages
    (owner_id, practice_reschedule_id, customer_id, customer_name, direction, kind, body, status, error_code)
  select p_owner_id, p_reschedule_id, p_customer_id, p_customer_name,
         m.direction, m.kind, m.body, m.status, m.error_code
  from jsonb_to_recordset(p_rows)
    as m (direction text, kind text, body text, status text, error_code text);

  if p_mark_replied then
    update rain_day.practice_messages
      set status = 'replied'
      where owner_id = p_owner_id and practice_reschedule_id = p_reschedule_id
        and customer_id = p_customer_id and direction = 'out' and kind = 'text'
        and status = 'sent';
  end if;
  return v_added;
end;
$$;

-- clear_practice: remove everything practice for one owner. Returns how many bubbles went.
create function rain_day.clear_practice(p_owner_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from rain_day.practice_messages where owner_id = p_owner_id;
  delete from rain_day.practice_reschedules where owner_id = p_owner_id;
  delete from rain_day.practice_opt_outs where owner_id = p_owner_id;
  return v_count;
end;
$$;

-- Server only. The service role bypasses RLS; nobody else may call these.
revoke all on function rain_day.reserve_practice_action(uuid, integer, integer) from public, anon, authenticated;
revoke all on function rain_day.create_practice_reschedule(uuid, uuid, date, date, text, jsonb, integer) from public, anon, authenticated;
revoke all on function rain_day.add_practice_rows(uuid, uuid, uuid, text, jsonb, boolean, integer) from public, anon, authenticated;
revoke all on function rain_day.clear_practice(uuid) from public, anon, authenticated;
grant execute on function rain_day.reserve_practice_action(uuid, integer, integer) to service_role;
grant execute on function rain_day.create_practice_reschedule(uuid, uuid, date, date, text, jsonb, integer) to service_role;
grant execute on function rain_day.add_practice_rows(uuid, uuid, uuid, text, jsonb, boolean, integer) to service_role;
grant execute on function rain_day.clear_practice(uuid) to service_role;
