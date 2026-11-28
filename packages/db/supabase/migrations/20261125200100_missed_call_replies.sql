-- missed-call M4: reply capture and the owner's status buttons.

-- record_reply: attach an inbound text to the latest call from that number on that line and mark
-- the call replied. Called by the inbound webhook route (service role) after the signature check.
-- outcome: recorded | duplicate | blocked | no_call. A retried webhook (same provider message id)
-- is a duplicate. Calls the owner already moved on (called_back, booked, junk) keep their status.
create or replace function missed_call.record_reply(
  p_line_id uuid,
  p_caller text,
  p_body text,
  p_provider_message_id text
)
returns table (call_id uuid, outcome text)
language plpgsql
set search_path = ''
as $$
declare
  v_call uuid;
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
    where b.line_id = p_line_id and b.number = p_caller
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

  insert into missed_call.messages (call_id, direction, body, provider_message_id)
  values (v_call, 'in', p_body, p_provider_message_id);

  update missed_call.calls set status = 'replied'
  where id = v_call and status in ('missed', 'texted');

  return query select v_call, 'recorded'::text;
end;
$$;

revoke execute on function missed_call.record_reply(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function missed_call.record_reply(uuid, text, text, text) to service_role;

-- mark_call: the owner's Called back / Booked / Junk buttons. Runs as the signed-in owner, so RLS
-- decides which calls they can touch. Junk also blocks the number on that line, so it is never
-- auto-texted again; moving a call off Junk lifts a junk block (STOP opt-outs stay).
create or replace function missed_call.mark_call(p_call_id uuid, p_status missed_call.call_status)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line uuid;
  v_number text;
begin
  if p_status not in ('called_back', 'booked', 'junk') then
    raise exception 'status % cannot be set by an owner', p_status using errcode = '22023';
  end if;

  update missed_call.calls set status = p_status
  where id = p_call_id
  returning line_id, caller_number into v_line, v_number;
  if not found then
    raise exception 'call not found' using errcode = 'P0002';
  end if;

  if p_status = 'junk' then
    insert into missed_call.blocked_numbers (line_id, number, reason)
    values (v_line, v_number, 'junk')
    on conflict (line_id, number) do nothing;
  else
    delete from missed_call.blocked_numbers
    where line_id = v_line and number = v_number and reason = 'junk';
  end if;
end;
$$;

revoke execute on function missed_call.mark_call(uuid, missed_call.call_status)
  from public, anon;
grant execute on function missed_call.mark_call(uuid, missed_call.call_status)
  to authenticated, service_role;
