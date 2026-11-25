import type { Db } from '@speedy/db/core';
import type { Tables } from '@speedy/db/types';
import type { E164 } from '@speedy/lib/phone';

export type OwnerSettings = Tables<{ schema: 'rain_day' }, 'owner_settings'>;

/** The signed-in owner's settings row, or null. RLS limits it to their own. */
export async function getOwnerSettings(db: Db): Promise<OwnerSettings | null> {
  const { data, error } = await db
    .schema('rain_day')
    .from('owner_settings')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Service role: only called after the code was checked. */
export async function saveVerifiedCell(service: Db, ownerId: string, cell: E164): Promise<void> {
  const { error } = await service
    .schema('rain_day')
    .from('owner_settings')
    .upsert(
      { owner_id: ownerId, owner_cell: cell, owner_cell_verified_at: new Date().toISOString() },
      { onConflict: 'owner_id' },
    );
  if (error) throw error;
}

export async function removeVerifiedCell(service: Db, ownerId: string): Promise<void> {
  const { error } = await service
    .schema('rain_day')
    .from('owner_settings')
    .update({ owner_cell: null, owner_cell_verified_at: null })
    .eq('owner_id', ownerId);
  if (error) throw error;
}

/** Plain copy when an owner has no texting number yet. */
export const NO_SENDER_MESSAGE =
  "Your texting number isn't set up yet. We'll let you know when it's ready.";

/** The number this owner texts from and gets replies on, or null until an admin sets it. */
export function senderNumberOf(settings: OwnerSettings | null): E164 | null {
  return (settings?.sender_number as E164 | null | undefined) ?? null;
}
