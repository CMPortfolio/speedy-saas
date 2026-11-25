import type { OptOutStore } from '@speedy/sms/send';

import { fail, type Db } from './store-db';

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
      throw new Error('optOuts is read-only; use stopList to record STOP or START');
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
        // START: lifts the STOP, and puts a junk block back while a Junk call from the number remains.
        const { error } = await db.rpc('clear_opt_out', { p_line_id: lineId, p_number: number });
        if (error) fail('clear opt-out', error.message);
      }
    },
  };
}
