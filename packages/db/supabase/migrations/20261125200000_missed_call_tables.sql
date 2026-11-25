-- missed-call M3: lines, calls, messages, blocked_numbers.
--
-- Who writes what:
--   * Owners (role authenticated) read their own lines, calls and messages, edit the wording and
--     hours of their own line, set the status on their own calls, and manage their blocked numbers.
--   * Everything a provider webhook produces (calls, messages) is written by server routes that
--     checked the provider's signature first, using the service role (bypasses RLS).
--   * provider_number is admin-entered for v1: owners cannot set or change it (column grants), so
--     nobody can point their line at a number that is not theirs.
--   * anon gets nothing.

create type missed_call.call_status as enum
  ('missed', 'texted', 'replied', 'called_back', 'booked', 'junk');

create type missed_call.message_direction as enum ('in', 'out');

-- ---------------------------------------------------------------------------
-- lines: one business number an owner has forwarded their missed calls to
-- ---------------------------------------------------------------------------
create table missed_call.lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- The number callers reach (E.164). Entered by an admin; null until assigned.
  provider_number text unique
    check (provider_number ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  owner_cell text not null
    check (owner_cell ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  business_name text not null check (char_length(business_name) between 1 and 120),
  template text not null check (char_length(template) between 1 and 320),
  after_hours_template text check (char_length(after_hours_template) between 1 and 320),
  -- {"start":"17:00","end":"08:00"} local time on the line's timezone; start is inclusive, end is
  -- exclusive, and the window may wrap midnight. null means the line is never in quiet hours.
  quiet_hours jsonb check (jsonb_typeof(quiet_hours) = 'object'),
  -- IANA zone name. Validated by the app (zod); unknown names fall back to America/New_York.
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table missed_call.lines is 'One row per forwarded business number. provider_number is admin-entered.';

create index lines_owner_id_idx on missed_call.lines (owner_id);

create trigger lines_set_updated_at
  before update on missed_call.lines
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- calls: every missed call, newest first in the owner's list
-- ---------------------------------------------------------------------------
create table missed_call.calls (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references missed_call.lines (id) on delete cascade,
  caller_number text not null check (caller_number ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  -- The provider's call id. Unique so a retried webhook can never log or text twice.
  provider_call_sid text not null unique check (char_length(provider_call_sid) > 0),
  received_at timestamptz not null default now(),
  status missed_call.call_status not null default 'missed',
  -- When the auto-text was claimed for this call. Drives the 24 hour per-number cooldown;
  -- cleared again when the send fails so a failed text does not burn the cooldown.
  texted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table missed_call.calls is 'Every missed call. status missed = logged but no auto-text went out (cooldown, blocked, outside the US, over the cap or the send failed); texted = the text went out.';

create index calls_line_received_idx on missed_call.calls (line_id, received_at desc);
create index calls_line_caller_idx on missed_call.calls (line_id, caller_number, received_at desc);

create trigger calls_set_updated_at
  before update on missed_call.calls
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- messages: the texts we sent and the replies we got, per call
-- ---------------------------------------------------------------------------
create table missed_call.messages (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references missed_call.calls (id) on delete cascade,
  direction missed_call.message_direction not null,
  body text not null check (char_length(body) <= 1600),
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index messages_call_id_idx on missed_call.messages (call_id, created_at);
create unique index messages_provider_message_id_idx
  on missed_call.messages (provider_message_id) where provider_message_id is not null;

create trigger messages_set_updated_at
  before update on missed_call.messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- blocked_numbers: Junk and STOP. Nothing in here is ever auto-texted.
-- ---------------------------------------------------------------------------
create table missed_call.blocked_numbers (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references missed_call.lines (id) on delete cascade,
  number text not null check (number ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  reason text not null default 'junk' check (reason in ('junk', 'opted_out', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_id, number)
);

create trigger blocked_numbers_set_updated_at
  before update on missed_call.blocked_numbers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges. The schema default privileges hand every role everything, so take it back first.
-- ---------------------------------------------------------------------------
revoke all on missed_call.lines, missed_call.calls, missed_call.messages, missed_call.blocked_numbers
  from anon, authenticated;

grant select on missed_call.lines to authenticated;
grant insert (owner_id, owner_cell, business_name, template, after_hours_template, quiet_hours, timezone)
  on missed_call.lines to authenticated;
grant update (owner_cell, business_name, template, after_hours_template, quiet_hours, timezone)
  on missed_call.lines to authenticated;
grant delete on missed_call.lines to authenticated;

grant select on missed_call.calls to authenticated;
grant update (status) on missed_call.calls to authenticated;

grant select on missed_call.messages to authenticated;

grant select, insert, delete on missed_call.blocked_numbers to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: owners see only their own. A policy for every operation; the ones that say false are
-- operations only the server (service role, which bypasses RLS) may do.
-- ---------------------------------------------------------------------------
alter table missed_call.lines enable row level security;
alter table missed_call.calls enable row level security;
alter table missed_call.messages enable row level security;
alter table missed_call.blocked_numbers enable row level security;

create policy "lines: owners select own"
  on missed_call.lines for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "lines: owners insert own"
  on missed_call.lines for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "lines: owners update own"
  on missed_call.lines for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "lines: owners delete own"
  on missed_call.lines for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy "calls: owners select own"
  on missed_call.calls for select to authenticated
  using (exists (
    select 1 from missed_call.lines l
    where l.id = calls.line_id and l.owner_id = (select auth.uid())
  ));

create policy "calls: only the server inserts"
  on missed_call.calls for insert to authenticated
  with check (false);

create policy "calls: owners update own"
  on missed_call.calls for update to authenticated
  using (exists (
    select 1 from missed_call.lines l
    where l.id = calls.line_id and l.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from missed_call.lines l
    where l.id = calls.line_id and l.owner_id = (select auth.uid())
  ));

create policy "calls: only the server deletes"
  on missed_call.calls for delete to authenticated
  using (false);

create policy "messages: owners select own"
  on missed_call.messages for select to authenticated
  using (exists (
    select 1 from missed_call.calls c
    join missed_call.lines l on l.id = c.line_id
    where c.id = messages.call_id and l.owner_id = (select auth.uid())
  ));

create policy "messages: only the server inserts"
  on missed_call.messages for insert to authenticated
  with check (false);

create policy "messages: only the server updates"
  on missed_call.messages for update to authenticated
  using (false) with check (false);

create policy "messages: only the server deletes"
  on missed_call.messages for delete to authenticated
  using (false);

create policy "blocked_numbers: owners select own"
  on missed_call.blocked_numbers for select to authenticated
  using (exists (
    select 1 from missed_call.lines l
    where l.id = blocked_numbers.line_id and l.owner_id = (select auth.uid())
  ));

create policy "blocked_numbers: owners insert own"
  on missed_call.blocked_numbers for insert to authenticated
  with check (exists (
    select 1 from missed_call.lines l
    where l.id = blocked_numbers.line_id and l.owner_id = (select auth.uid())
  ));

create policy "blocked_numbers: nobody updates"
  on missed_call.blocked_numbers for update to authenticated
  using (false) with check (false);

create policy "blocked_numbers: owners delete own"
  on missed_call.blocked_numbers for delete to authenticated
  using (exists (
    select 1 from missed_call.lines l
    where l.id = blocked_numbers.line_id and l.owner_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- log_missed_call: log a missed call and decide, atomically, whether to text the caller.
-- Called by the webhook route (service role) after the signature check. A per caller advisory
-- lock makes two simultaneous webhooks for the same caller line up, so the cooldown cannot be
-- raced. outcome: send | duplicate | cooldown | blocked. On `send` the call is already marked
-- as claimed (texted_at), so a second call a moment later sees the cooldown.
-- ---------------------------------------------------------------------------
create or replace function missed_call.log_missed_call(
  p_line_id uuid,
  p_caller text,
  p_call_sid text,
  p_cooldown interval default interval '24 hours'
)
returns table (call_id uuid, outcome text, first_contact boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_call uuid;
  v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_line_id::text || p_caller, 0));

  select c.id into v_call from missed_call.calls c where c.provider_call_sid = p_call_sid;
  if found then
    return query select v_call, 'duplicate'::text, false;
    return;
  end if;

  insert into missed_call.calls (line_id, caller_number, provider_call_sid, status)
  values (p_line_id, p_caller, p_call_sid, 'missed')
  returning id into v_call;

  if exists (
    select 1 from missed_call.blocked_numbers b
    where b.line_id = p_line_id and b.number = p_caller
  ) then
    return query select v_call, 'blocked'::text, false;
    return;
  end if;

  if exists (
    select 1 from missed_call.calls c
    where c.line_id = p_line_id and c.caller_number = p_caller and c.id <> v_call
      and c.texted_at > now() - p_cooldown
  ) then
    return query select v_call, 'cooldown'::text, false;
    return;
  end if;

  select not exists (
    select 1 from missed_call.calls c
    where c.line_id = p_line_id and c.caller_number = p_caller and c.id <> v_call
      and c.texted_at is not null
  ) into v_first;

  update missed_call.calls set texted_at = now() where id = v_call;
  return query select v_call, 'send'::text, v_first;
end;
$$;

revoke execute on function missed_call.log_missed_call(uuid, text, text, interval)
  from public, anon, authenticated;
grant execute on function missed_call.log_missed_call(uuid, text, text, interval) to service_role;
