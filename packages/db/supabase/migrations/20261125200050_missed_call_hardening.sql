-- missed-call M3 security review fixes.
--
-- 1. Owners can no longer lift a STOP: only the service role (START) clears an opted_out block,
--    and owners can only add junk or manual blocks.
-- 2. log_missed_call caps auto-texts per line (20 an hour, 100 a day) so a flood of calls from
--    many numbers cannot run up the SMS bill, and can skip the text for numbers the app will not
--    text (outside the US). The call is always logged.

drop policy "blocked_numbers: owners insert own" on missed_call.blocked_numbers;
create policy "blocked_numbers: owners insert own"
  on missed_call.blocked_numbers for insert to authenticated
  with check (
    reason in ('junk', 'manual')
    and exists (
      select 1 from missed_call.lines l
      where l.id = blocked_numbers.line_id and l.owner_id = (select auth.uid())
    )
  );

drop policy "blocked_numbers: owners delete own" on missed_call.blocked_numbers;
create policy "blocked_numbers: owners delete own"
  on missed_call.blocked_numbers for delete to authenticated
  using (
    reason <> 'opted_out'
    and exists (
      select 1 from missed_call.lines l
      where l.id = blocked_numbers.line_id and l.owner_id = (select auth.uid())
    )
  );

drop function missed_call.log_missed_call(uuid, text, text, interval);

-- outcome: send | duplicate | cooldown | blocked | foreign | rate_limited
create function missed_call.log_missed_call(
  p_line_id uuid,
  p_caller text,
  p_call_sid text,
  p_cooldown interval default interval '24 hours',
  p_allow_text boolean default true,
  p_hourly_cap integer default 20,
  p_daily_cap integer default 100
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

  if not p_allow_text then
    return query select v_call, 'foreign'::text, false;
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

  -- The caps are per line, so callers must line up on the line too (always caller lock first,
  -- then line lock, so two webhooks can never deadlock).
  perform pg_advisory_xact_lock(hashtextextended('line:' || p_line_id::text, 0));
  if (
    select count(*) from missed_call.calls c
    where c.line_id = p_line_id and c.id <> v_call and c.texted_at > now() - interval '1 hour'
  ) >= p_hourly_cap or (
    select count(*) from missed_call.calls c
    where c.line_id = p_line_id and c.id <> v_call and c.texted_at > now() - interval '24 hours'
  ) >= p_daily_cap then
    return query select v_call, 'rate_limited'::text, false;
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

revoke execute on function missed_call.log_missed_call(uuid, text, text, interval, boolean, integer, integer)
  from public, anon, authenticated;
grant execute on function missed_call.log_missed_call(uuid, text, text, interval, boolean, integer, integer)
  to service_role;
