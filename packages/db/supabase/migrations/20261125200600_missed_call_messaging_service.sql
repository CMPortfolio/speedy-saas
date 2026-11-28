-- missed-call: one Twilio Messaging Service per owner.
--
-- Under A2P 10DLC each business has its own brand, campaign and Messaging Service (a service links
-- to one campaign), so the service lives on the line next to its number. Like provider_number it is
-- entered by an admin with the service role: owners can read it but not set it (the owners' column
-- grants on missed_call.lines do not include it).

alter table missed_call.lines
  add column provider_messaging_service_sid text
    check (provider_messaging_service_sid ~ '^MG[0-9a-f]{32}$');

comment on column missed_call.lines.provider_messaging_service_sid is
  'The owner''s Twilio Messaging Service (MG...), admin-entered. Every text from this line is sent from provider_number and through this service when set.';
