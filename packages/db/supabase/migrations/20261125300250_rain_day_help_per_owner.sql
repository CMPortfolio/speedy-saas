-- rain-day: the once-a-day HELP answer is per owner and number, not per number. With one texting
-- number per owner, HELP to one owner's number must not use up the answer for another owner's.
-- The old table only held a 24-hour throttle, so nothing worth keeping is lost by recreating it.

drop function rain_day.claim_help_reply(text);
drop table rain_day.help_replies;

create table rain_day.help_replies (
  owner_id uuid not null references auth.users (id) on delete cascade,
  phone text not null check (phone ~ '^\+1[2-9][0-9]{9}$'),
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, phone)
);

create trigger help_replies_set_updated_at
  before update on rain_day.help_replies
  for each row execute function public.set_updated_at();

alter table rain_day.help_replies enable row level security;

create policy "help_replies: no owner access"
  on rain_day.help_replies for all to authenticated using (false) with check (false);

revoke all on rain_day.help_replies from anon, authenticated;
grant all on rain_day.help_replies to service_role;

-- claim_help_reply: true when a HELP reply may go out now for this owner and number (and records
-- it), false when one already went in the last 24 hours. One statement, so two HELPs at once
-- cannot both win.
create function rain_day.claim_help_reply(p_owner_id uuid, p_phone text)
returns boolean
language sql
set search_path = ''
as $$
  with claimed as (
    insert into rain_day.help_replies as h (owner_id, phone, last_sent_at)
    values (p_owner_id, p_phone, now())
    on conflict (owner_id, phone) do update set last_sent_at = now()
      where h.last_sent_at < now() - interval '24 hours'
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function rain_day.claim_help_reply(uuid, text) from public, anon, authenticated;
grant execute on function rain_day.claim_help_reply(uuid, text) to service_role;
