import type { Database } from '@speedy/db/types';
import { appError } from '@speedy/lib/result';
import type { OptOutStore } from '@speedy/sms/send';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Db = SupabaseClient<Database, 'missed_call'>;

export function fail(what: string, cause: unknown): never {
  throw Object.assign(new Error(`missed_call store: ${what}`), {
    appError: appError('db_error', what, cause),
  });
}

/** The send guard: any block on the line, whether Junk, STOP or manual. Read-only. */
export function anyBlockStore(db: Db, lineId: string): OptOutStore {
  return {
    async isOptedOut(number) {
      const { data, error } = await db
        .from('blocked_numbers')
        .select('id')
        .eq('line_id', lineId)
        .eq('number', number)
        .maybeSingle();
      if (error) fail('check blocked number', error.message);
      return data !== null;
    },
    async setOptedOut() {
      fail('use stopList to record STOP', 'optOuts is read-only');
    },
  };
}

/** Only numbers that texted STOP (and not START since). Hand this one to applyOptOutKeyword. */
export function stopListStore(db: Db, lineId: string): OptOutStore {
  return {
    async isOptedOut(number) {
      const { data, error } = await db
        .from('blocked_numbers')
        .select('id')
        .eq('line_id', lineId)
        .eq('number', number)
        .eq('reason', 'opted_out')
        .maybeSingle();
      if (error) fail('check opt-out', error.message);
      return data !== null;
    },
    async setOptedOut(number, optedOut) {
      if (optedOut) {
        // A STOP always wins: it replaces a junk or manual block on the same number.
        const { error } = await db
          .from('blocked_numbers')
          .upsert(
            { line_id: lineId, number, reason: 'opted_out' },
            { onConflict: 'line_id,number' },
          );
        if (error) fail('save opt-out', error.message);
      } else {
        const { error } = await db
          .from('blocked_numbers')
          .delete()
          .eq('line_id', lineId)
          .eq('number', number)
          .eq('reason', 'opted_out');
        if (error) fail('clear opt-out', error.message);
      }
    },
  };
}
