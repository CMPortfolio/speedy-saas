import type { Db } from '@speedy/db/core';
import type { Tables } from '@speedy/db/types';

export type PracticeReschedule = Tables<{ schema: 'rain_day' }, 'practice_reschedules'>;
export type PracticeMessage = Tables<{ schema: 'rain_day' }, 'practice_messages'>;

/** The owner's practice rain days, newest first. RLS limits rows to the owner. */
export async function listPracticeReschedules(db: Db, limit = 20): Promise<PracticeReschedule[]> {
  const { data, error } = await db
    .schema('rain_day')
    .from('practice_reschedules')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function listPracticeMessages(
  db: Db,
  rescheduleId: string,
): Promise<PracticeMessage[]> {
  const { data, error } = await db
    .schema('rain_day')
    .from('practice_messages')
    .select('*')
    .eq('practice_reschedule_id', rescheduleId)
    .order('seq');
  if (error) throw error;
  return data;
}

/** The customer replies the owner has typed on the practice phone, newest first. */
export async function listPracticeReplies(db: Db, limit = 20): Promise<PracticeMessage[]> {
  const { data, error } = await db
    .schema('rain_day')
    .from('practice_messages')
    .select('*')
    .eq('direction', 'in')
    .eq('kind', 'text')
    .order('seq', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/** Customers who typed STOP on the practice phone. */
export async function listPracticeOptedOutIds(db: Db): Promise<Set<string>> {
  const { data, error } = await db
    .schema('rain_day')
    .from('practice_opt_outs')
    .select('customer_id');
  if (error) throw error;
  return new Set(data.map((r) => r.customer_id));
}

export interface PracticeDaySummary {
  day: PracticeReschedule;
  /** Customers who got a practice text, and customers skipped (opted out). */
  texted: number;
  skipped: number;
  replies: number;
}

/** The owner's practice rain days with how many customers each reached. RLS limits rows. */
export async function listPracticeDaySummaries(db: Db, limit = 20): Promise<PracticeDaySummary[]> {
  const days = await listPracticeReschedules(db, limit);
  if (days.length === 0) return [];
  const { data, error } = await db
    .schema('rain_day')
    .from('practice_messages')
    .select('practice_reschedule_id, direction, kind, status')
    .in(
      'practice_reschedule_id',
      days.map((d) => d.id),
    );
  if (error) throw error;
  return days.map((day) => {
    const own = data.filter((m) => m.practice_reschedule_id === day.id);
    const outgoing = own.filter((m) => m.direction === 'out' && m.kind === 'text');
    return {
      day,
      texted: outgoing.filter((m) => m.status !== 'skipped').length,
      skipped: outgoing.filter((m) => m.status === 'skipped').length,
      replies: own.filter((m) => m.direction === 'in' && m.kind === 'text').length,
    };
  });
}
