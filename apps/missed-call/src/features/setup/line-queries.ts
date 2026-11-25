import type { Database } from '@speedy/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import { parseQuietHours, type QuietHours } from '../missed-calls/quiet-hours';
import type { LineInput } from './schema';

/** The owner's line as the setup page shows it. */
export interface MyLine {
  id: string;
  businessName: string;
  ownerCell: string;
  ownerCellVerified: boolean;
  template: string;
  afterHoursTemplate: string | null;
  quietHours: QuietHours | null;
  /** Entered by an admin in v1. Null until Naples AI assigns one. */
  providerNumber: string | null;
  /** The owner's Twilio Messaging Service, admin-entered. */
  messagingServiceSid: string | null;
  /** IANA zone the quiet hours are read in. */
  timezone: string;
}

const COLUMNS =
  'id, business_name, owner_cell, owner_cell_verified, template, after_hours_template, quiet_hours, provider_number, provider_messaging_service_sid, timezone';

/** The signed-in owner's line, or null before setup. `client` carries their session, so RLS applies. */
export async function getMyLine(client: SupabaseClient<Database>): Promise<MyLine | null> {
  const { data, error } = await client
    .schema('missed_call')
    .from('lines')
    .select(COLUMNS)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`get line: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    businessName: data.business_name,
    ownerCell: data.owner_cell,
    ownerCellVerified: data.owner_cell_verified,
    template: data.template,
    afterHoursTemplate: data.after_hours_template,
    quietHours: parseQuietHours(data.quiet_hours),
    providerNumber: data.provider_number,
    messagingServiceSid: data.provider_messaging_service_sid,
    timezone: data.timezone,
  };
}

/** Create the owner's line, or update the one they have (v1: one line per owner). */
export async function saveLine(
  client: SupabaseClient<Database>,
  userId: string,
  input: LineInput,
): Promise<void> {
  const lines = client.schema('missed_call').from('lines');
  const existing = await getMyLine(client);
  const result = existing
    ? await lines.update(input).eq('id', existing.id)
    : await lines.insert({ ...input, owner_id: userId });
  if (result.error) throw new Error(`save line: ${result.error.message}`);
}
