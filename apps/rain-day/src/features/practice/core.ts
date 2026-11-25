import type { Db } from '@speedy/db/core';
import type { Json } from '@speedy/db/types';
import { logger } from '@speedy/lib/logger';
import type { E164 } from '@speedy/lib/phone';
import { practiceProvider, type PracticeSink } from '@speedy/sms/practice';

import type { Customer } from '@/features/customers/queries';
import { dispatchMessages, type DispatchRow } from '@/features/rain-day/dispatch';
import { hasOverlongBody, planMessages } from '@/features/rain-day/plan';
import type { SendInput } from '@/features/rain-day/schema';
import type { OwnerSettings } from '@/features/settings/owner-cell';
import { describeNewDay } from '@/lib/dates';
import { codeOf } from '@/lib/error-code';

import { PRACTICE_ACTIONS_PER_HOUR, PRACTICE_MAX_MESSAGES } from './constants';
import { isPracticeOwner, PRACTICE_FULL, PRACTICE_RATE_LIMITED, PRACTICE_REFUSED } from './gate';
import { planPracticeReply } from './reply';

const log = logger.child({ feature: 'rain-day-practice' });

export type PracticeResult<T = Record<never, never>> =
  ({ ok: true } & T) | { ok: false; message: string };

/** What every practice action needs. `service` is the only writer: owners cannot write practice rows. */
export interface PracticeContext {
  service: Db;
  ownerId: string;
  /** The owner's own settings, read through RLS. The server decides practice mode from them. */
  settings: OwnerSettings | null;
}

const FAILED = 'We could not do that just now. Try again in a minute.';

/** Refuse unless the owner is in practice mode, then spend one of their practice actions. */
async function begin(ctx: PracticeContext): Promise<PracticeResult> {
  if (!isPracticeOwner(ctx.settings)) return { ok: false, message: PRACTICE_REFUSED };
  const { data, error } = await ctx.service.schema('rain_day').rpc('reserve_practice_action', {
    p_owner_id: ctx.ownerId,
    p_limit: PRACTICE_ACTIONS_PER_HOUR,
    p_window_seconds: 3600,
  });
  if (error) {
    log.warn('practice rate limit check failed', { code: codeOf(error) });
    return { ok: false, message: FAILED };
  }
  return data ? { ok: true } : { ok: false, message: PRACTICE_RATE_LIMITED };
}

function dbMessage(error: { message?: string; code?: string } | null): string {
  if (error?.message === 'practice_full') return PRACTICE_FULL;
  log.warn('practice write failed', { code: error?.code });
  return FAILED;
}

/** A made-up sender for the practice provider. It never leaves the app and is not stored. */
const PRACTICE_FROM = '+12395550100' as E164;

/**
 * Where the practice provider puts a text: one bubble on this owner's practice phone, for the
 * owner's own customer with that number. Scoped to one owner and one practice rain day; the
 * database checks both again. Stores the customer by id only.
 */
function practiceSink(
  ctx: PracticeContext,
  rescheduleId: string,
  customers: readonly Pick<Customer, 'id' | 'phone'>[],
): PracticeSink {
  const byPhone = new Map(customers.map((c) => [c.phone, c.id]));
  return {
    async add(message) {
      const customerId = byPhone.get(message.to);
      if (!customerId)
        throw Object.assign(new Error('Not one of your customers.'), { code: 'unknown_customer' });
      const { data, error } = await ctx.service.schema('rain_day').rpc('add_practice_out', {
        p_owner_id: ctx.ownerId,
        p_reschedule_id: rescheduleId,
        p_customer_id: customerId,
        p_body: message.body,
        p_max_messages: PRACTICE_MAX_MESSAGES,
      });
      if (error) {
        const known =
          error.message === 'practice_full' ? 'practice_full' : (error.code ?? 'failed');
        throw Object.assign(new Error(error.message), { code: known });
      }
      return { id: data };
    },
  };
}

export interface PracticeSendInput {
  /** That day's customers, read through RLS. */
  customers: readonly Customer[];
  /** Phones on the owner's real STOP list: read only, they show as skipped in practice too. */
  realOptedOutPhones: ReadonlySet<string>;
  /** Customers who typed STOP on the practice phone. */
  practiceOptedOutIds: ReadonlySet<string>;
  /** Customers who already had a real text from this owner: no opt-out line for them. */
  contactedIds: ReadonlySet<string>;
  businessName: string;
  today: string;
}

/**
 * "Send as practice": the same plan as a real send (one text per ticked customer, opted-out
 * customers skipped) and the same dispatch, with the practice provider in place of Twilio. The
 * provider is built here, never taken from `getSms()`, so a practice send cannot reach a carrier.
 * Nothing real is written: no rain day, message, reply or opt-out, and no real cap is used.
 */
export async function sendPractice(
  ctx: PracticeContext,
  input: PracticeSendInput,
  request: SendInput,
): Promise<PracticeResult<{ rescheduleId: string; alreadySent: boolean }>> {
  const gate = await begin(ctx);
  if (!gate.ok) return gate;

  const optedOut = new Set(input.realOptedOutPhones);
  for (const c of input.customers) {
    if (input.practiceOptedOutIds.has(c.id)) optedOut.add(c.phone);
  }
  const plan = planMessages({
    customers: input.customers,
    selectedIds: request.customerIds,
    optedOutPhones: optedOut,
    template: request.template,
    newDay: describeNewDay(request.to, input.today),
  });
  if (plan.length === 0) return { ok: false, message: 'Tick at least one customer.' };
  if (hasOverlongBody(plan)) {
    return {
      ok: false,
      message: 'One of the texts is too long once names are filled in. Shorten your message.',
    };
  }

  const shell = await ctx.service.schema('rain_day').rpc('create_practice_reschedule', {
    p_owner_id: ctx.ownerId,
    p_idempotency_key: request.idempotencyKey,
    p_from_date: request.from,
    p_to_date: request.to,
    p_template: request.template,
    p_messages: plan.map((m) => ({
      customer_id: m.customer_id,
      status: m.status,
      error_code: m.error_code,
    })) as unknown as Json,
    p_max_messages: PRACTICE_MAX_MESSAGES,
  });
  const row = shell.data?.[0];
  if (shell.error || !row) return { ok: false, message: dbMessage(shell.error) };
  if (!row.created) return { ok: true, rescheduleId: row.reschedule_id, alreadySent: true };

  const byId = new Map(input.customers.map((c) => [c.id, c]));
  const rows: DispatchRow[] = plan.flatMap((m) => {
    const customer = byId.get(m.customer_id);
    if (!customer || m.status !== 'queued') return [];
    return [
      {
        id: m.customer_id,
        customerId: customer.id,
        phone: customer.phone as E164,
        body: m.body,
        isFirstContact: !input.contactedIds.has(customer.id),
      },
    ];
  });
  const outcome = await dispatchMessages({
    provider: practiceProvider(practiceSink(ctx, row.reschedule_id, input.customers)),
    store: { isOptedOut: async (phone) => optedOut.has(phone), markResult: async () => undefined },
    rows,
    sender: { from: PRACTICE_FROM },
    businessName: input.businessName,
  });
  if (outcome.failed > 0) {
    log.warn('practice texts not all saved', { failed: outcome.failed, of: rows.length });
    return { ok: false, message: PRACTICE_FULL };
  }
  return { ok: true, rescheduleId: row.reschedule_id, alreadySent: false };
}

export interface PracticeReplyRequest {
  rescheduleId: string;
  customerId: string;
  body: string;
  businessName: string;
}

/**
 * A reply typed on the practice phone as the customer (or STOP, START, HELP). The same rules as
 * production decide what follows; the results go to the practice tables only. A STOP or START here
 * is a practice STOP or START: it never touches the real opt-outs.
 */
export async function replyPractice(
  ctx: PracticeContext,
  request: PracticeReplyRequest,
): Promise<PracticeResult<{ forwarded: boolean }>> {
  const gate = await begin(ctx);
  if (!gate.ok) return gate;
  const db = ctx.service.schema('rain_day');
  const { customerId } = request;

  // Both ids came from the browser: the customer and the practice rain day must be this owner's.
  const own = await db
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('owner_id', ctx.ownerId);
  if (own.error) return { ok: false, message: dbMessage(own.error) };
  if (own.data.length === 0) return { ok: false, message: 'That customer is no longer here.' };
  const sent = await db
    .from('practice_messages')
    .select('id')
    .eq('owner_id', ctx.ownerId)
    .eq('practice_reschedule_id', request.rescheduleId)
    .eq('customer_id', customerId)
    .eq('direction', 'out')
    .eq('kind', 'text')
    .limit(1);
  if (sent.error) return { ok: false, message: dbMessage(sent.error) };
  if (sent.data.length === 0) {
    return { ok: false, message: 'That customer was not part of this practice rain day.' };
  }

  const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [stopped, helped] = await Promise.all([
    db
      .from('practice_opt_outs')
      .select('customer_id')
      .eq('owner_id', ctx.ownerId)
      .eq('customer_id', customerId),
    db
      .from('practice_messages')
      .select('id')
      .eq('owner_id', ctx.ownerId)
      .eq('customer_id', customerId)
      .eq('kind', 'help')
      .gt('created_at', dayAgo)
      .limit(1),
  ]);
  if (stopped.error || helped.error) {
    return { ok: false, message: dbMessage(stopped.error ?? helped.error) };
  }

  const plan = planPracticeReply({
    body: request.body,
    businessName: request.businessName,
    optedOut: stopped.data.length > 0,
    helpAnsweredToday: helped.data.length > 0,
  });
  const added = await db.rpc('add_practice_rows', {
    p_owner_id: ctx.ownerId,
    p_reschedule_id: request.rescheduleId,
    p_customer_id: customerId,
    p_rows: plan.rows as unknown as Json,
    p_mark_replied: plan.markReplied,
    p_max_messages: PRACTICE_MAX_MESSAGES,
  });
  if (added.error) return { ok: false, message: dbMessage(added.error) };

  if (plan.optOut === 'stop') {
    await db
      .from('practice_opt_outs')
      .upsert(
        { owner_id: ctx.ownerId, customer_id: customerId },
        { onConflict: 'owner_id,customer_id' },
      );
  } else if (plan.optOut === 'start') {
    await db
      .from('practice_opt_outs')
      .delete()
      .eq('owner_id', ctx.ownerId)
      .eq('customer_id', customerId);
  }
  return { ok: true, forwarded: plan.rows.some((r) => r.direction === 'forward') };
}

/** Remove everything practice for this owner. Allowed whatever the mode: it only deletes their own. */
export async function clearPractice(
  ctx: Pick<PracticeContext, 'service' | 'ownerId'>,
): Promise<PracticeResult<{ removed: number }>> {
  const { data, error } = await ctx.service
    .schema('rain_day')
    .rpc('clear_practice', { p_owner_id: ctx.ownerId });
  if (error) return { ok: false, message: dbMessage(error) };
  return { ok: true, removed: data };
}

/** Practice rows older than a week are deleted (delete on read: called when a practice page loads). */
export async function expirePractice(
  ctx: Pick<PracticeContext, 'service' | 'ownerId'>,
): Promise<void> {
  const { error } = await ctx.service
    .schema('rain_day')
    .rpc('expire_practice', { p_owner_id: ctx.ownerId });
  if (error) log.warn('practice expiry failed', { code: codeOf(error) });
}
