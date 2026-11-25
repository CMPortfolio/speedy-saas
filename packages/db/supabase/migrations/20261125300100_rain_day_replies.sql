-- rain-day R4: owner settings (verified cell for reply forwarding), phone verification state,
-- replies, and the functions that record them atomically.
--
-- Everything the owner must not be able to forge (the verified cell, verification state, reply
-- rows, forward counts) is written only by the server with the service role. Owners may read
-- their own settings and replies.

-- owner_settings: one row per owner. The cell here has been proven with a texted code.
create table rain_day.owner_settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  owner_cell text check (owner_cell is null or owner_cell ~ '^\+1[2-9][0-9]{9}$'),
  owner_cell_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_cell is null) = (owner_cell_verified_at is null))
);

comment on table rain_day.owner_settings is 'Rain Day: per-owner settings. owner_cell is only ever a verified number.';

create trigger owner_settings_set_updated_at
  before update on rain_day.owner_settings
  for each row execute function public.set_updated_at();

alter table rain_day.owner_settings enable row level security;

create policy "owner_settings: owners select own"
  on rain_day.owner_settings for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner_settings: owners cannot insert"
  on rain_day.owner_settings for insert to authenticated with check (false);
create policy "owner_settings: owners cannot update"
  on rain_day.owner_settings for update to authenticated using (false) with check (false);
create policy "owner_settings: owners cannot delete"
  on rain_day.owner_settings for delete to authenticated using (false);

-- phone_verifications: the one pending code per owner. Only a salted hash is stored.
create table rain_day.phone_verifications (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  phone text not null check (phone ~ '^\+1[2-9][0-9]{9}$'),
  code_hash text not null,
  salt text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger phone_verifications_set_updated_at
  before update on rain_day.phone_verifications
  for each row execute function public.set_updated_at();

-- verification_sends: one row per code text, to rate-limit them.
create table rain_day.verification_sends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index verification_sends_owner_id_created_at_idx
  on rain_day.verification_sends (owner_id, created_at desc);

alter table rain_day.phone_verifications enable row level security;
alter table rain_day.verification_sends enable row level security;

-- Server only: no owner policy lets anything through, for any operation.
create policy "phone_verifications: no owner access"
  on rain_day.phone_verifications for all to authenticated using (false) with check (false);
create policy "verification_sends: no owner access"
  on rain_day.verification_sends for all to authenticated using (false) with check (false);

-- replies: a customer's text back, matched to the message it answers.
create table rain_day.replies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  customer_id uuid references rain_day.customers (id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  reschedule_message_id uuid references rain_day.reschedule_messages (id) on delete set null,
  body text not null check (char_length(body) <= 1600),
  -- The provider's id for the inbound text. Providers retry webhooks; this makes a repeat a no-op.
  provider_message_id text,
  -- pending: forward owed. sent / failed: forward attempted. capped: over the hourly limit.
  -- not_set_up: the owner has no verified cell.
  forward_status text not null default 'pending'
    check (forward_status in ('pending', 'sent', 'failed', 'capped', 'not_set_up')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index replies_provider_message_id_key
  on rain_day.replies (provider_message_id) where provider_message_id is not null;
create index replies_owner_id_created_at_idx on rain_day.replies (owner_id, created_at desc);

create trigger replies_set_updated_at
  before update on rain_day.replies
  for each row execute function public.set_updated_at();

alter table rain_day.replies enable row level security;

create policy "replies: owners select own"
  on rain_day.replies for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "replies: owners cannot insert"
  on rain_day.replies for insert to authenticated with check (false);
create policy "replies: owners cannot update"
  on rain_day.replies for update to authenticated using (false) with check (false);
create policy "replies: owners cannot delete"
  on rain_day.replies for delete to authenticated using (false);

-- Grants: owners read owner_settings and replies and nothing else; anon gets nothing.
revoke all on rain_day.owner_settings, rain_day.phone_verifications, rain_day.verification_sends,
  rain_day.replies from anon;
revoke all on rain_day.phone_verifications, rain_day.verification_sends from authenticated;
revoke insert, update, delete on rain_day.owner_settings, rain_day.replies from authenticated;
grant select on rain_day.owner_settings, rain_day.replies to authenticated;
grant all on rain_day.owner_settings, rain_day.phone_verifications, rain_day.verification_sends,
  rain_day.replies to service_role;

-- reserve_verification_send: count this owner's code texts in the window and record one, or
-- refuse. The advisory lock makes two requests at once take turns.
create function rain_day.reserve_verification_send(
  p_owner_id uuid, p_limit integer, p_window_seconds integer
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('rain_day.verify:' || p_owner_id::text, 0));
  delete from rain_day.verification_sends
    where owner_id = p_owner_id and created_at < now() - interval '1 day';
  select count(*) into v_count from rain_day.verification_sends
    where owner_id = p_owner_id and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into rain_day.verification_sends (owner_id) values (p_owner_id);
  return true;
end;
$$;

-- consume_verification_attempt: add one to the attempts and return the new count (null if none).
create function rain_day.consume_verification_attempt(p_owner_id uuid)
returns integer
language sql
set search_path = ''
as $$
  update rain_day.phone_verifications
    set attempts = attempts + 1
    where owner_id = p_owner_id
    returning attempts;
$$;

-- record_reply: file an inbound text under the message it answers. The customer is found by
-- phone; the owner is whoever texted that number most recently (one tool number serves every
-- owner). Sets that message to replied, stores the reply once per provider id, and decides, under
-- a lock, whether it may be forwarded: needs a verified cell and fewer than p_forward_cap
-- forwards to this owner in the past hour.
create function rain_day.record_reply(
  p_from text, p_provider_message_id text, p_body text, p_forward_cap integer
)
returns table (
  matched boolean,
  duplicate boolean,
  reply_id uuid,
  owner_id uuid,
  customer_name text,
  customer_phone text,
  owner_cell text,
  forward boolean
)
language plpgsql
set search_path = ''
as $$
declare
  v_msg record;
  v_cell text;
  v_count integer;
  v_status text;
  v_id uuid;
begin
  select m.id as message_id, m.customer_id, m.customer_name, c.owner_id
    into v_msg
  from rain_day.reschedule_messages m
  join rain_day.customers c on c.id = m.customer_id
  where c.phone = p_from
    and m.sent_at is not null
    and m.status in ('sent', 'delivered', 'replied')
  order by m.sent_at desc
  limit 1;

  if not found then
    return query select false, false, null::uuid, null::uuid, null::text, null::text, null::text, false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rain_day.forward:' || v_msg.owner_id::text, 0));

  select s.owner_cell into v_cell from rain_day.owner_settings s
    where s.owner_id = v_msg.owner_id and s.owner_cell_verified_at is not null;
  select count(*) into v_count from rain_day.replies r
    where r.owner_id = v_msg.owner_id
      and r.forward_status in ('pending', 'sent', 'failed')
      and r.created_at > now() - interval '1 hour';

  v_status := case
    when v_cell is null then 'not_set_up'
    when v_count >= p_forward_cap then 'capped'
    else 'pending'
  end;

  insert into rain_day.replies
    (owner_id, customer_id, customer_name, reschedule_message_id, body, provider_message_id, forward_status)
  values
    (v_msg.owner_id, v_msg.customer_id, v_msg.customer_name, v_msg.message_id,
     p_body, nullif(p_provider_message_id, ''), v_status)
  on conflict (provider_message_id) where provider_message_id is not null do nothing
  returning id into v_id;

  if v_id is null then
    return query select true, true, null::uuid, v_msg.owner_id, v_msg.customer_name, p_from, null::text, false;
    return;
  end if;

  update rain_day.reschedule_messages set status = 'replied' where id = v_msg.message_id;

  return query select true, false, v_id, v_msg.owner_id, v_msg.customer_name, p_from, v_cell,
    v_status = 'pending';
end;
$$;

-- Server only. The service role bypasses RLS; nobody else may call these.
revoke all on function rain_day.reserve_verification_send(uuid, integer, integer) from public, anon, authenticated;
revoke all on function rain_day.consume_verification_attempt(uuid) from public, anon, authenticated;
revoke all on function rain_day.record_reply(text, text, text, integer) from public, anon, authenticated;
grant execute on function rain_day.reserve_verification_send(uuid, integer, integer) to service_role;
grant execute on function rain_day.consume_verification_attempt(uuid) to service_role;
grant execute on function rain_day.record_reply(text, text, text, integer) to service_role;
