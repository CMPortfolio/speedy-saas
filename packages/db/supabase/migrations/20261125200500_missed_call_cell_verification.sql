-- missed-call M5 review: confirming the owner's cell with a texted code, one line per owner, and a
-- per caller lock on clear_opt_out.
--
-- The challenge, the send log and the attempt counts are written by the server only (service role).
-- Owners get no access to them at all, so nobody can read a hash or reset their own attempts.

create table missed_call.cell_verifications (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  phone text not null check (phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  code_hash text not null,
  salt text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger cell_verifications_set_updated_at
  before update on missed_call.cell_verifications
  for each row execute function public.set_updated_at();

create table missed_call.cell_verification_sends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cell_verification_sends_owner_idx
  on missed_call.cell_verification_sends (owner_id, created_at desc);

create trigger cell_verification_sends_set_updated_at
  before update on missed_call.cell_verification_sends
  for each row execute function public.set_updated_at();

revoke all on missed_call.cell_verifications, missed_call.cell_verification_sends
  from anon, authenticated;

alter table missed_call.cell_verifications enable row level security;
alter table missed_call.cell_verification_sends enable row level security;

create policy "cell_verifications: no owner access"
  on missed_call.cell_verifications for all to authenticated using (false) with check (false);
create policy "cell_verification_sends: no owner access"
  on missed_call.cell_verification_sends for all to authenticated using (false) with check (false);

-- Count code texts in the window and record this one, or refuse. Atomic per owner.
create function missed_call.reserve_cell_code_send(
  p_owner_id uuid, p_limit integer, p_window_seconds integer
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('missed_call.cell:' || p_owner_id::text, 0));
  delete from missed_call.cell_verification_sends
    where owner_id = p_owner_id and created_at < now() - interval '1 day';
  select count(*) into v_count from missed_call.cell_verification_sends
    where owner_id = p_owner_id and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into missed_call.cell_verification_sends (owner_id) values (p_owner_id);
  return true;
end;
$$;

-- Add one to the attempts and return the new count (null when there is no challenge).
create function missed_call.consume_cell_attempt(p_owner_id uuid)
returns integer
language sql
set search_path = ''
as $$
  update missed_call.cell_verifications
    set attempts = attempts + 1
    where owner_id = p_owner_id
    returning attempts;
$$;

-- Mark the owner's line verified, but only if its cell is still the number the code went to.
-- Returns whether a line was updated. The one place owner_cell_verified is set to true.
create function missed_call.confirm_owner_cell(p_owner_id uuid, p_phone text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update missed_call.lines set owner_cell_verified = true
    where owner_id = p_owner_id and owner_cell = p_phone;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke execute on function missed_call.reserve_cell_code_send(uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function missed_call.consume_cell_attempt(uuid) from public, anon, authenticated;
revoke execute on function missed_call.confirm_owner_cell(uuid, text) from public, anon, authenticated;
grant execute on function missed_call.reserve_cell_code_send(uuid, integer, integer) to service_role;
grant execute on function missed_call.consume_cell_attempt(uuid) to service_role;
grant execute on function missed_call.confirm_owner_cell(uuid, text) to service_role;

-- One line per owner (v1). If an owner already has more than one, keep the oldest: move the newer
-- lines' calls and blocks onto it, then drop the extras. Their provider numbers are released.
do $$
declare
  dup record;
begin
  for dup in
    select l.id as extra_id,
           (select k.id from missed_call.lines k
             where k.owner_id = l.owner_id
             order by k.created_at, k.id limit 1) as keep_id
    from missed_call.lines l
  loop
    if dup.extra_id <> dup.keep_id then
      update missed_call.calls set line_id = dup.keep_id where line_id = dup.extra_id;
      insert into missed_call.blocked_numbers (line_id, number, reason)
        select dup.keep_id, b.number, b.reason from missed_call.blocked_numbers b
        where b.line_id = dup.extra_id
        on conflict (line_id, number) do nothing;
      delete from missed_call.lines where id = dup.extra_id;
    end if;
  end loop;
end;
$$;

alter table missed_call.lines add constraint lines_owner_id_key unique (owner_id);
drop index missed_call.lines_owner_id_idx;

-- clear_opt_out now takes the same per caller lock as log_missed_call and record_reply, so a START
-- cannot slip between a call being logged and its text being claimed.
create or replace function missed_call.clear_opt_out(p_line_id uuid, p_number text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_line_id::text || p_number, 0));

  delete from missed_call.blocked_numbers
  where line_id = p_line_id and number = p_number and reason = 'opted_out';

  if exists (
    select 1 from missed_call.calls c
    where c.line_id = p_line_id and c.caller_number = p_number and c.status = 'junk'
  ) then
    insert into missed_call.blocked_numbers (line_id, number, reason)
    values (p_line_id, p_number, 'junk')
    on conflict (line_id, number) do nothing;
  end if;
end;
$$;
