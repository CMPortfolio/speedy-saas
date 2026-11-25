-- missed-call practice mode: try the texting flow with no phone and no real number.
--
-- An owner whose line has no real number yet gets a "practice phone". Everything the tool would text
-- is saved here instead, so it is shown on screen and nothing leaves the app. These tables are
-- separate from calls and messages, so practice never touches real data or counts against the real
-- caps. Owners can read their own rows; everything is written by the server (service role) only.

create table missed_call.practice_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Fictional numbers only: (239) 555-0100 to 0199 are reserved for fiction.
  caller_number text not null check (caller_number ~ '^\+12395550[1][0-9]{2}$'),
  received_at timestamptz not null default now(),
  status missed_call.call_status not null default 'missed',
  -- When the practice auto-text was shown; drives the same 24 hour cooldown as the real flow.
  texted_at timestamptz,
  -- The practice caller texted STOP.
  opted_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets practice_messages point at a call AND its owner, so a message can never be filed under
  -- another owner's call whatever id a request carries.
  unique (id, owner_id)
);

create index practice_calls_owner_received_idx
  on missed_call.practice_calls (owner_id, received_at desc);
create index practice_calls_owner_caller_idx
  on missed_call.practice_calls (owner_id, caller_number, received_at desc);

create trigger practice_calls_set_updated_at
  before update on missed_call.practice_calls
  for each row execute function public.set_updated_at();

create table missed_call.practice_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  call_id uuid not null,
  -- out: the text the caller gets. in: the caller's reply. forward: the lead texted to "Your cell".
  direction text not null check (direction in ('out', 'in', 'forward')),
  body text not null check (char_length(body) <= 1600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (call_id, owner_id)
    references missed_call.practice_calls (id, owner_id) on delete cascade
);

create index practice_messages_owner_created_idx
  on missed_call.practice_messages (owner_id, created_at);
create index practice_messages_call_idx on missed_call.practice_messages (call_id, created_at);

create trigger practice_messages_set_updated_at
  before update on missed_call.practice_messages
  for each row execute function public.set_updated_at();

create table missed_call.practice_action_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index practice_action_log_owner_idx
  on missed_call.practice_action_log (owner_id, created_at desc);

create trigger practice_action_log_set_updated_at
  before update on missed_call.practice_action_log
  for each row execute function public.set_updated_at();

revoke all on missed_call.practice_calls, missed_call.practice_messages,
  missed_call.practice_action_log from anon, authenticated;
grant select on missed_call.practice_calls, missed_call.practice_messages to authenticated;

alter table missed_call.practice_calls enable row level security;
alter table missed_call.practice_messages enable row level security;
alter table missed_call.practice_action_log enable row level security;

create policy "practice_calls: owners select own"
  on missed_call.practice_calls for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "practice_calls: only the server inserts"
  on missed_call.practice_calls for insert to authenticated with check (false);
create policy "practice_calls: only the server updates"
  on missed_call.practice_calls for update to authenticated using (false) with check (false);
create policy "practice_calls: only the server deletes"
  on missed_call.practice_calls for delete to authenticated using (false);

create policy "practice_messages: owners select own"
  on missed_call.practice_messages for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "practice_messages: only the server inserts"
  on missed_call.practice_messages for insert to authenticated with check (false);
create policy "practice_messages: only the server updates"
  on missed_call.practice_messages for update to authenticated using (false) with check (false);
create policy "practice_messages: only the server deletes"
  on missed_call.practice_messages for delete to authenticated using (false);

create policy "practice_action_log: no owner access"
  on missed_call.practice_action_log for all to authenticated using (false) with check (false);

-- Count a practice action and say whether it may go ahead: 'ok', 'rate_limited' (more than
-- p_limit actions in the window) or 'full' (the owner already has p_max_messages practice texts or
-- p_max_calls practice calls saved; clear practice first). Atomic per owner, so two taps cannot both squeeze under a limit.
create function missed_call.reserve_practice_action(
  p_owner_id uuid,
  p_limit integer default 60,
  p_window_seconds integer default 3600,
  p_max_messages integer default 400,
  p_max_calls integer default 100
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('missed_call.practice:' || p_owner_id::text, 0));
  delete from missed_call.practice_action_log
    where owner_id = p_owner_id and created_at < now() - interval '1 day';
  select count(*) into v_count from missed_call.practice_action_log
    where owner_id = p_owner_id and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return 'rate_limited';
  end if;
  if (select count(*) from missed_call.practice_messages where owner_id = p_owner_id)
       >= p_max_messages
     or (select count(*) from missed_call.practice_calls where owner_id = p_owner_id)
       >= p_max_calls then
    return 'full';
  end if;
  insert into missed_call.practice_action_log (owner_id) values (p_owner_id);
  return 'ok';
end;
$$;

revoke execute on function missed_call.reserve_practice_action(uuid, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function missed_call.reserve_practice_action(uuid, integer, integer, integer, integer)
  to service_role;
