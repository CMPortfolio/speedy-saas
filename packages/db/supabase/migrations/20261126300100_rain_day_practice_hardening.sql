-- rain-day practice mode, hardening from the security review.
--   * Practice rows reference customer_id only: no copy of a customer's name. The name and number
--     are read from rain_day.customers when the phone is drawn, so deleting a customer deletes
--     their practice bubbles too (customer_id now cascades).
--   * Every function checks that the customer belongs to the owner, in the same statement.
--   * Practice rows expire after 7 days (expire_practice, run when the practice pages load).
-- Practice data is throwaway, so existing practice rows are cleared rather than migrated.

delete from rain_day.practice_reschedules;
delete from rain_day.practice_opt_outs;

alter table rain_day.practice_messages drop column customer_name;
alter table rain_day.practice_messages
  drop constraint practice_messages_customer_id_fkey,
  alter column customer_id set not null,
  add constraint practice_messages_customer_id_fkey
    foreign key (customer_id) references rain_day.customers (id) on delete cascade;

drop function rain_day.create_practice_reschedule(uuid, uuid, date, date, text, jsonb, integer);
drop function rain_day.add_practice_rows(uuid, uuid, uuid, text, jsonb, boolean, integer);

-- create_practice_reschedule: make one practice rain day, once per key, and file the customers who
-- are skipped (opted out). The texts themselves are added one by one as the practice provider
-- "sends" them (add_practice_out). p_messages is a JSON array of
-- { customer_id, status, error_code } with status 'queued' (to be sent) or 'skipped'; all of them
-- count against the owner's cap of p_max_messages bubbles, so practice cannot fill the database.
create function rain_day.create_practice_reschedule(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_from_date date,
  p_to_date date,
  p_template text,
  p_messages jsonb,
  p_max_messages integer
)
returns table (reschedule_id uuid, created boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer;
begin
  if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) = 0 then
    raise exception 'no messages' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_messages) as m (customer_id uuid, status text, error_code text)
    where m.customer_id is null or m.status is null or m.status not in ('queued', 'skipped')
      or (m.error_code is not null and m.error_code not in ('non_us', 'opted_out'))
  ) then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  -- Only the owner's own customers.
  if exists (
    select 1
    from jsonb_to_recordset(p_messages) as m (customer_id uuid)
    where not exists (
      select 1 from rain_day.customers c where c.id = m.customer_id and c.owner_id = p_owner_id
    )
  ) then
    raise exception 'unknown customer' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rain_day.practice_send:' || p_owner_id::text, 0));

  select r.id into v_id from rain_day.practice_reschedules r
    where r.owner_id = p_owner_id and r.idempotency_key = p_idempotency_key;
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  select count(*) into v_count from rain_day.practice_messages where owner_id = p_owner_id;
  if v_count + jsonb_array_length(p_messages) > p_max_messages then
    raise exception 'practice_full' using errcode = 'P0001';
  end if;

  insert into rain_day.practice_reschedules (owner_id, from_date, to_date, template, idempotency_key)
  values (p_owner_id, p_from_date, p_to_date, p_template, p_idempotency_key)
  returning id into v_id;

  insert into rain_day.practice_messages
    (owner_id, practice_reschedule_id, customer_id, direction, body, status, error_code)
  select p_owner_id, v_id, m.customer_id, 'out', 'Skipped: opted out', 'skipped', m.error_code
  from jsonb_to_recordset(p_messages) as m (customer_id uuid, status text, error_code text)
  where m.status = 'skipped';

  return query select v_id, true;
end;
$$;

-- add_practice_out: the practice provider "sends" one text: a bubble for that customer. The
-- reschedule and the customer must both be the owner's own, and the owner's cap holds.
create function rain_day.add_practice_out(
  p_owner_id uuid,
  p_reschedule_id uuid,
  p_customer_id uuid,
  p_body text,
  p_max_messages integer
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_id uuid;
begin
  if p_body is null or char_length(p_body) not between 1 and 1600 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if not exists (
    select 1 from rain_day.practice_reschedules r
    where r.id = p_reschedule_id and r.owner_id = p_owner_id
  ) or not exists (
    select 1 from rain_day.customers c where c.id = p_customer_id and c.owner_id = p_owner_id
  ) then
    raise exception 'unknown practice rain day or customer' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rain_day.practice_send:' || p_owner_id::text, 0));
  select count(*) into v_count from rain_day.practice_messages where owner_id = p_owner_id;
  if v_count + 1 > p_max_messages then
    raise exception 'practice_full' using errcode = 'P0001';
  end if;

  insert into rain_day.practice_messages
    (owner_id, practice_reschedule_id, customer_id, direction, kind, body, status)
  values (p_owner_id, p_reschedule_id, p_customer_id, 'out', 'text', p_body, 'sent')
  returning id into v_id;
  return v_id;
end;
$$;

-- add_practice_rows: the bubbles that follow from something the owner did on the practice phone
-- (a reply typed as the customer, the forward to their cell, a HELP answer), in one transaction and
-- under the same cap. The forward row holds only what the customer said; the name and number are
-- put in front of it when the phone is drawn.
-- p_rows is a JSON array of { direction, kind, body, status } for one customer in one practice
-- rain day; p_mark_replied also flips that customer's 'out' bubble to 'replied'.
create function rain_day.add_practice_rows(
  p_owner_id uuid,
  p_reschedule_id uuid,
  p_customer_id uuid,
  p_rows jsonb,
  p_mark_replied boolean,
  p_max_messages integer
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_added integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'no rows' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as m (direction text, kind text, body text, status text)
    where m.direction is null or m.direction not in ('out', 'in', 'forward')
      or m.kind is null or m.kind not in ('text', 'help', 'note')
      or m.status is null or m.status not in ('sent', 'replied', 'received')
      or m.body is null or char_length(m.body) not between 1 and 1600
  ) then
    raise exception 'invalid_row' using errcode = '22023';
  end if;
  if not exists (
    select 1 from rain_day.practice_reschedules r
    where r.id = p_reschedule_id and r.owner_id = p_owner_id
  ) or not exists (
    select 1 from rain_day.customers c where c.id = p_customer_id and c.owner_id = p_owner_id
  ) then
    raise exception 'unknown practice rain day or customer' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rain_day.practice_send:' || p_owner_id::text, 0));

  select count(*) into v_count from rain_day.practice_messages where owner_id = p_owner_id;
  v_added := jsonb_array_length(p_rows);
  if v_count + v_added > p_max_messages then
    raise exception 'practice_full' using errcode = 'P0001';
  end if;

  insert into rain_day.practice_messages
    (owner_id, practice_reschedule_id, customer_id, direction, kind, body, status)
  select p_owner_id, p_reschedule_id, p_customer_id, m.direction, m.kind, m.body, m.status
  from jsonb_to_recordset(p_rows) as m (direction text, kind text, body text, status text);

  if p_mark_replied then
    update rain_day.practice_messages
      set status = 'replied'
      where owner_id = p_owner_id and practice_reschedule_id = p_reschedule_id
        and customer_id = p_customer_id and direction = 'out' and kind = 'text'
        and status = 'sent';
  end if;
  return v_added;
end;
$$;

-- expire_practice: practice rain days older than a week go, with their bubbles and any practice
-- STOPs older than a week. Returns how many rain days went.
create function rain_day.expire_practice(p_owner_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from rain_day.practice_reschedules
    where owner_id = p_owner_id and created_at < now() - interval '7 days';
  get diagnostics v_count = row_count;
  delete from rain_day.practice_opt_outs
    where owner_id = p_owner_id and created_at < now() - interval '7 days';
  return v_count;
end;
$$;

revoke all on function rain_day.create_practice_reschedule(uuid, uuid, date, date, text, jsonb, integer) from public, anon, authenticated;
revoke all on function rain_day.add_practice_out(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function rain_day.add_practice_rows(uuid, uuid, uuid, jsonb, boolean, integer) from public, anon, authenticated;
revoke all on function rain_day.expire_practice(uuid) from public, anon, authenticated;
grant execute on function rain_day.create_practice_reschedule(uuid, uuid, date, date, text, jsonb, integer) to service_role;
grant execute on function rain_day.add_practice_out(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function rain_day.add_practice_rows(uuid, uuid, uuid, jsonb, boolean, integer) to service_role;
grant execute on function rain_day.expire_practice(uuid) to service_role;
