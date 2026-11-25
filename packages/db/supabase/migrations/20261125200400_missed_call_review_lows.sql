-- missed-call security and code review lows.
--
-- * record_reply: a per line daily cap of 200 forwards, and a per caller storage cap of 50 replies
--   a day. Past 50 the reply is dropped (outcome `dropped`, nothing stored), so one number cannot
--   fill the table. The forward caps are unchanged (5 an hour and 20 a day per caller, 30 an hour
--   per line) and still save the reply but do not forward it.
-- * claim_help_reply: HELP answers are marked with messages.kind = 'help' and matched on that,
--   not on the wording. It returns the new message id so a failed send can release the claim.
-- * clear_opt_out: START lifts a STOP, and puts the junk block back if the owner still has a call
--   from that number marked Junk.

alter table missed_call.messages
  add column kind text not null default 'text' check (kind in ('text', 'help'));

drop function missed_call.record_reply(uuid, text, text, text, integer, integer, integer);

-- outcome: recorded | rate_limited | dropped | duplicate | blocked | no_call
create function missed_call.record_reply(
  p_line_id uuid,
  p_caller text,
  p_body text,
  p_provider_message_id text,
  p_caller_hourly_cap integer default 5,
  p_caller_daily_cap integer default 20,
  p_line_hourly_cap integer default 30,
  p_line_daily_cap integer default 200,
  p_caller_store_cap integer default 50
)
returns table (call_id uuid, outcome text)
language plpgsql
set search_path = ''
as $$
declare
  v_call uuid;
  v_limited boolean;
  v_caller_day integer;
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

  select count(*) into v_caller_day
  from missed_call.messages m join missed_call.calls c on c.id = m.call_id
  where c.line_id = p_line_id and c.caller_number = p_caller and m.direction = 'in'
    and m.created_at > now() - interval '24 hours';
  if v_caller_day >= p_caller_store_cap then
    return query select v_call, 'dropped'::text;
    return;
  end if;

  -- Line lock after the caller lock, same order as log_missed_call.
  perform pg_advisory_xact_lock(hashtextextended('line:' || p_line_id::text, 0));
  select
    (select count(*) from missed_call.messages m join missed_call.calls c on c.id = m.call_id
       where c.line_id = p_line_id and c.caller_number = p_caller and m.direction = 'in'
         and m.created_at > now() - interval '1 hour') >= p_caller_hourly_cap
    or v_caller_day >= p_caller_daily_cap
    or (select count(*) from missed_call.messages m join missed_call.calls c on c.id = m.call_id
       where c.line_id = p_line_id and m.direction = 'in'
         and m.created_at > now() - interval '1 hour') >= p_line_hourly_cap
    or (select count(*) from missed_call.messages m join missed_call.calls c on c.id = m.call_id
       where c.line_id = p_line_id and m.direction = 'in'
         and m.created_at > now() - interval '24 hours') >= p_line_daily_cap
  into v_limited;

  insert into missed_call.messages (call_id, direction, body, provider_message_id)
  values (v_call, 'in', p_body, p_provider_message_id);

  update missed_call.calls set status = 'replied'
  where id = v_call and status in ('missed', 'texted');

  return query select v_call, (case when v_limited then 'rate_limited' else 'recorded' end)::text;
end;
$$;

revoke execute on function
  missed_call.record_reply(uuid, text, text, text, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function
  missed_call.record_reply(uuid, text, text, text, integer, integer, integer, integer, integer)
  to service_role;

drop function missed_call.claim_help_reply(uuid, text, text);

-- Returns the id of the saved HELP answer, or null when we should not answer.
create function missed_call.claim_help_reply(p_line_id uuid, p_caller text, p_body text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_call uuid;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_line_id::text || p_caller, 0));

  select c.id into v_call from missed_call.calls c
  where c.line_id = p_line_id and c.caller_number = p_caller
  order by c.received_at desc, c.created_at desc
  limit 1;
  if not found then
    return null;
  end if;

  if exists (
    select 1 from missed_call.messages m join missed_call.calls c on c.id = m.call_id
    where c.line_id = p_line_id and c.caller_number = p_caller
      and m.direction = 'out' and m.kind = 'help'
      and m.created_at > now() - interval '24 hours'
  ) then
    return null;
  end if;

  insert into missed_call.messages (call_id, direction, body, kind)
  values (v_call, 'out', p_body, 'help')
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function missed_call.claim_help_reply(uuid, text, text)
  from public, anon, authenticated;
grant execute on function missed_call.claim_help_reply(uuid, text, text) to service_role;

create function missed_call.clear_opt_out(p_line_id uuid, p_number text)
returns void
language plpgsql
set search_path = ''
as $$
begin
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

revoke execute on function missed_call.clear_opt_out(uuid, text) from public, anon, authenticated;
grant execute on function missed_call.clear_opt_out(uuid, text) to service_role;
