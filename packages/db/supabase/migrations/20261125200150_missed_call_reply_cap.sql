-- missed-call M4 security review fix: cap reply forwards at 30 an hour per line, so a flood of
-- inbound texts cannot turn the owner's cell (not yet verified) into an SMS sink. A reply over the
-- cap is still saved and shows in the list; it just is not forwarded (forward = false).

drop function missed_call.record_reply(uuid, text, text, text);

create function missed_call.record_reply(
  p_line_id uuid,
  p_caller text,
  p_body text,
  p_provider_message_id text,
  p_forward_cap integer default 30
)
returns table (call_id uuid, outcome text, forward boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_call uuid;
  v_recent integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_line_id::text || p_caller, 0));

  if p_provider_message_id is not null then
    select m.call_id into v_call from missed_call.messages m
    where m.provider_message_id = p_provider_message_id;
    if found then
      return query select v_call, 'duplicate'::text, false;
      return;
    end if;
  end if;

  if exists (
    select 1 from missed_call.blocked_numbers b
    where b.line_id = p_line_id and b.number = p_caller
  ) then
    return query select null::uuid, 'blocked'::text, false;
    return;
  end if;

  select c.id into v_call from missed_call.calls c
  where c.line_id = p_line_id and c.caller_number = p_caller
  order by c.received_at desc, c.created_at desc
  limit 1;
  if not found then
    return query select null::uuid, 'no_call'::text, false;
    return;
  end if;

  -- Line lock after the caller lock, same order as log_missed_call.
  perform pg_advisory_xact_lock(hashtextextended('line:' || p_line_id::text, 0));
  select count(*) into v_recent
  from missed_call.messages m
  join missed_call.calls c on c.id = m.call_id
  where c.line_id = p_line_id and m.direction = 'in' and m.created_at > now() - interval '1 hour';

  insert into missed_call.messages (call_id, direction, body, provider_message_id)
  values (v_call, 'in', p_body, p_provider_message_id);

  update missed_call.calls set status = 'replied'
  where id = v_call and status in ('missed', 'texted');

  return query select v_call, 'recorded'::text, v_recent < p_forward_cap;
end;
$$;

revoke execute on function missed_call.record_reply(uuid, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function missed_call.record_reply(uuid, text, text, text, integer) to service_role;
