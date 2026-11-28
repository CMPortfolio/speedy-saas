-- rain-day: each owner's own Twilio Messaging Service.
-- Under A2P 10DLC every owner has their own brand and campaign, and a campaign attaches to one
-- Messaging Service, so every text is sent with BOTH the owner's number and the owner's service.
-- Set by an admin with the service role; owners can read it but never write it. One service per
-- owner: a service shared between owners would share a campaign.

alter table rain_day.owner_settings
  add column sender_messaging_service_sid text
    check (sender_messaging_service_sid is null or sender_messaging_service_sid ~ '^MG[0-9a-f]{32}$');

create unique index owner_settings_sender_messaging_service_sid_key
  on rain_day.owner_settings (sender_messaging_service_sid)
  where sender_messaging_service_sid is not null;

comment on column rain_day.owner_settings.sender_messaging_service_sid is 'The owner''s own Twilio Messaging Service (MG...), whose sender pool holds sender_number and which carries their A2P campaign. Set by an admin; owners cannot write it.';
