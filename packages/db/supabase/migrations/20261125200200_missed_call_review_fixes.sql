-- missed-call M4 review fixes.
--
-- * record_reply: per caller caps (5 an hour, 20 a day) and the per line cap (30 an hour) on
--   forwarded replies. A reply over a cap is still saved, but the outcome is rate_limited and the
--   route does not forward it. Only junk and manual blocks drop a reply; a caller who texted STOP
--   can still reply to the owner (STOP only stops texts TO them).
-- * claim_help_reply: HELP is answered only to a number that has called this line, once a day.
-- * mark_call: runs as the definer after an explicit ownership check, so owners no longer need
--   (and lose) direct update on calls. It lifts a junk block only when this call was junk and no
--   other junk call from that number remains.

drop function missed_call.record_reply(uuid, text, text, text, integer);

-- outcome: recorded | rate_limited | duplicate | blocked | no_call
create function missed_call.record_reply(
  p_line_id uuid,
  p_caller text,
  p_body text,
  p_provider_message_id text,
  p_caller_hourly_cap integer default 5,
  p_caller_daily_cap integer default 20,
  p_line_hourly_cap integer default 30
)
returns table (call_id uuid, outcome text)
language plpgsql
set search_path = ''
as $$
declare
  v_call uuid;
  v_limited boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_line_id::text || p_caller, 0));

  if p_provider_message_id is not null then
    select m.call_id into v_call from missed_call.messages m
    where m.provider_message_id = p_provider_message_id;
    if found then
      return query select v_call, 'duplicate'::text;
      return;
    end if;
  end if;

  if exists (
    select 1 from missed_call.blocked_numbers b
    where b.line_id = p_line_id and b.number = p_caller and b.reason in ('junk', 'manual')
  ) then
    return query select null::uuid, 'blocked'::text;
    return;
  end if;

  select c.id into v_call from missed_call.calls c
  where c.line_id = p_line_id and c.caller_number = p_caller
  order by c.received_at desc, c.created_at desc
  limit 1;
  if not found then
    return query select null::uuid, 'no_call'::text;
    return;
  end if;

  -- Line lock after the caller lock, same order as log_missed_call.
  perform pg_advisory_xact_lock(hashtextextended('line:' || p_line_id::text, 0));
  select
    (select count(*) from missed_call.messages m join missed_call.calls c on c.id = m.call_id
       where c.line_id = p_line_id and c.caller_number = p_caller and m.direction = 'in'
         and m.created_at > now() - interval '1 hour') >= p_caller_hourly_cap
    or (select count(*) from missed_call.messages m join missed_call.calls c on c.id = m.call_id
       where c.line_id = p_line_id and c.caller_number = p_caller and m.direction = 'in'
         and m.created_at > now() - interval '24 hours') >= p_caller_daily_cap
    or (select count(*) from missed_call.messages m join missed_call.calls c on c.id = m.call_id
       where c.line_id = p_line_id and m.direction = 'in'
         and m.created_at > now() - interval '1 hour') >= p_line_hourly_cap
  into v_limited;

  insert into missed_call.messages (call_id, direction, body, provider_message_id)
  values (v_call, 'in', p_body, p_provider_message_id);

  update missed_call.calls set status = 'replied'
  where id = v_call and status in ('missed', 'texted');

  return query select v_call, (case when v_limited then 'rate_limited' else 'recorded' end)::text;
end;
$$;

revoke execute on function missed_call.record_reply(uuid, text, text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function missed_call.record_reply(uuid, text, text, text, integer, integer, integer)
  to service_role;

-- claim_help_reply: true when we should answer this HELP. Saves the answer as an outgoing message
-- on the caller's latest call, which is also what limits it to one a day per number.
create function missed_call.claim_help_reply(p_line_id uuid, p_caller text, p_body text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_call uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_line_id::text || p_caller, 0));

  select c.id into v_call from missed_call.calls c
  where c.line_id = p_line_id and c.caller_number = p_caller
  order by c.received_at desc, c.created_at desc
  limit 1;
  if not found then
    return false;
  end if;

  if exists (
    select 1 from missed_call.messages m join missed_call.calls c on c.id = m.call_id
    where c.line_id = p_line_id and c.caller_number = p_caller and m.direction = 'out'
      and m.body = p_body and m.created_at > now() - interval '24 hours'
  ) then
    return false;
  end if;

  insert into missed_call.messages (call_id, direction, body) values (v_call, 'out', p_body);
  return true;
end;
$$;

revoke execute on function missed_call.claim_help_reply(uuid, text, text)
  from public, anon, authenticated;
grant execute on function missed_call.claim_help_reply(uuid, text, text) to service_role;

-- mark_call: now the only way an owner changes a call's status.
revoke update (status) on missed_call.calls from authenticated;

create or replace function missed_call.mark_call(p_call_id uuid, p_status missed_call.call_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line uuid;
  v_number text;
  v_prev missed_call.call_status;
begin
  if p_status not in ('called_back', 'booked', 'junk') then
    raise exception 'status % cannot be set by an owner', p_status using errcode = '22023';
  end if;

  -- The call must belong to a line the signed-in user owns. Row locked so two taps cannot race.
  select c.line_id, c.caller_number, c.status into v_line, v_number, v_prev
  from missed_call.calls c
  join missed_call.lines l on l.id = c.line_id
  where c.id = p_call_id and l.owner_id = (select auth.uid())
  for update of c;
  if not found then
    raise exception 'call not found' using errcode = 'P0002';
  end if;

  update missed_call.calls set status = p_status where id = p_call_id;

  if p_status = 'junk' then
    -- Never overwrites an existing block: a STOP stays a STOP.
    insert into missed_call.blocked_numbers (line_id, number, reason)
    values (v_line, v_number, 'junk')
    on conflict (line_id, number) do nothing;
  elsif v_prev = 'junk' and not exists (
    select 1 from missed_call.calls c
    where c.line_id = v_line and c.caller_number = v_number and c.status = 'junk'
  ) then
    delete from missed_call.blocked_numbers
    where line_id = v_line and number = v_number and reason = 'junk';
  end if;
end;
$$;

revoke execute on function missed_call.mark_call(uuid, missed_call.call_status) from public, anon;
grant execute on function missed_call.mark_call(uuid, missed_call.call_status)
  to authenticated, service_role;
