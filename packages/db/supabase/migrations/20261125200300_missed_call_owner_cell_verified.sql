-- missed-call M5: reply forwarding only goes to an owner cell the owner has proven is theirs.
-- owner_cell_verified is written by the server only (service role, after a one-time code): it is
-- not in the owners' column grants. Changing the cell puts the line back to unverified.

alter table missed_call.lines
  add column owner_cell_verified boolean not null default false;

comment on column missed_call.lines.owner_cell_verified is
  'True once the owner confirmed owner_cell with a one-time code. Replies are not forwarded until then.';

create or replace function missed_call.reset_owner_cell_verified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_cell is distinct from old.owner_cell then
    new.owner_cell_verified := false;
  end if;
  return new;
end;
$$;

create trigger lines_reset_owner_cell_verified
  before update of owner_cell on missed_call.lines
  for each row execute function missed_call.reset_owner_cell_verified();
