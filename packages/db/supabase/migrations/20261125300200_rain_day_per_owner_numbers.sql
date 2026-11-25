-- rain-day: one texting number per owner.
--   * owner_settings.sender_number: the number this owner's texts go out from and replies come
--     back to. Entered by an admin (service role) for now; owners can read it but never write it.
--     Unique, so two owners can never share a number.
--   * record_reply now works for ONE owner: the inbound webhook finds the owner by the number
--     that was texted, then matches the sender among that owner's customers only. A competitor who
--     imports someone else's customers cannot receive their replies.
--   * reserve_verification_send also caps codes per day.
--   * contacted_customers: who already got a text from this owner (the opt-out line goes on a
--     customer's first text only), so the preview can show exactly what will be sent.

alter table rain_day.owner_settings
  add column sender_number text check (sender_number is null or sender_number ~ '^\+1[2-9][0-9]{9}$');

create unique index owner_settings_sender_number_key
  on rain_day.owner_settings (sender_number) where sender_number is not null;

comment on column rain_day.owner_settings.sender_number is 'The owner''s own texting number (E.164). Set by an admin with the service role; owners cannot write it.';

-- record_reply --------------------------------------------------------------------------------
drop function rain_day.record_reply(text, text, text, integer);

create function rain_day.record_reply(
  p_owner_id uuid, p_from text, p_provider_message_id text, p_body text, p_forward_cap integer
)
returns table (
  matched boolean,
  duplicate boolean,
  reply_id uuid,
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
  select m.id as message_id, m.customer_id, m.customer_name
    into v_msg
  from rain_day.reschedule_messages m
  join rain_day.customers c on c.id = m.customer_id
  where c.owner_id = p_owner_id
    and c.phone = p_from
    and m.sent_at is not null
    and m.status in ('sent', 'delivered', 'replied')
  order by m.sent_at desc
  limit 1;

  if not found then
    return query select false, false, null::uuid, null::text, null::text, null::text, false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rain_day.forward:' || p_owner_id::text, 0));

  select s.owner_cell into v_cell from rain_day.owner_settings s
    where s.owner_id = p_owner_id and s.owner_cell_verified_at is not null;
  select count(*) into v_count from rain_day.replies r
    where r.owner_id = p_owner_id
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
    (p_owner_id, v_msg.customer_id, v_msg.customer_name, v_msg.message_id,
     p_body, nullif(p_provider_message_id, ''), v_status)
  on conflict (provider_message_id) where provider_message_id is not null do nothing
  returning id into v_id;

  if v_id is null then
    return query select true, true, null::uuid, v_msg.customer_name, p_from, null::text, false;
    return;
  end if;

  update rain_day.reschedule_messages set status = 'replied' where id = v_msg.message_id;

  return query select true, false, v_id, v_msg.customer_name, p_from, v_cell, v_status = 'pending';
end;
$$;

revoke all on function rain_day.record_reply(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function rain_day.record_reply(uuid, text, text, text, integer) to service_role;

-- reserve_verification_send: per hour and per day ----------------------------------------------
drop function rain_day.reserve_verification_send(uuid, integer, integer);

create function rain_day.reserve_verification_send(
  p_owner_id uuid, p_limit integer, p_window_seconds integer, p_daily_limit integer
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_hour integer;
  v_day integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('rain_day.verify:' || p_owner_id::text, 0));
  delete from rain_day.verification_sends
    where owner_id = p_owner_id and created_at < now() - interval '2 days';
  select count(*) filter (where created_at > now() - make_interval(secs => p_window_seconds)),
         count(*) filter (where created_at > now() - interval '1 day')
    into v_hour, v_day
    from rain_day.verification_sends where owner_id = p_owner_id;
  if v_hour >= p_limit or v_day >= p_daily_limit then
    return false;
  end if;
  insert into rain_day.verification_sends (owner_id) values (p_owner_id);
  return true;
end;
$$;

revoke all on function rain_day.reserve_verification_send(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function rain_day.reserve_verification_send(uuid, integer, integer, integer) to service_role;

-- contacted_customers -----------------------------------------------------------------------------
create function rain_day.contacted_customers()
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct m.customer_id
  from rain_day.reschedule_messages m
  where m.customer_id is not null and m.status in ('sent', 'delivered', 'replied');
$$;

revoke all on function rain_day.contacted_customers() from public, anon;
grant execute on function rain_day.contacted_customers() to authenticated, service_role;
