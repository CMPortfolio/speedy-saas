import type { E164 } from '@speedy/lib/phone';
import type { OptOutStore } from '@speedy/sms/send';

import type {
  LineRecord,
  LogOutcome,
  MissedCallStore,
} from '../../src/features/missed-calls/store';

/** In-memory MissedCallStore that mirrors missed_call.log_missed_call. Unit tests only. */
export interface MemoryCall {
  id: string;
  lineId: string;
  caller: string;
  sid: string;
  status: string;
  textedAt: Date | null;
}

export interface MemoryMessage {
  callId: string;
  direction: 'in' | 'out';
  body: string;
  providerMessageId: string;
  at: Date;
}

export function memoryStore(lines: LineRecord[], now: () => Date = () => new Date()) {
  const calls: MemoryCall[] = [];
  const messages: MemoryMessage[] = [];
  const blocked = new Map<string, string>();
  const key = (lineId: string, n: string) => `${lineId}:${n}`;
  let touched = 0;

  const store: MissedCallStore = {
    async findLineByNumber(number) {
      touched += 1;
      return lines.find((l) => l.providerNumber === number) ?? null;
    },
    async logMissedCall(lineId, caller, sid, allowText) {
      touched += 1;
      const dup = calls.find((c) => c.sid === sid);
      if (dup) return { callId: dup.id, outcome: 'duplicate', firstContact: false };
      const call: MemoryCall = {
        id: `call-${calls.length + 1}`,
        lineId,
        caller,
        sid,
        status: 'missed',
        textedAt: null,
      };
      calls.push(call);
      const base = { callId: call.id, firstContact: false };
      if (blocked.has(key(lineId, caller))) return { ...base, outcome: 'blocked' as LogOutcome };
      if (!allowText) return { ...base, outcome: 'foreign' as LogOutcome };
      const others = calls.filter((c) => c.lineId === lineId && c.caller === caller && c !== call);
      const dayAgo = now().getTime() - 24 * 3600 * 1000;
      if (others.some((c) => c.textedAt && c.textedAt.getTime() > dayAgo))
        return { ...base, outcome: 'cooldown' };
      const since = (ms: number) =>
        calls.filter(
          (c) =>
            c !== call &&
            c.lineId === lineId &&
            c.textedAt &&
            c.textedAt.getTime() > now().getTime() - ms,
        ).length;
      if (since(3600_000) >= 20 || since(24 * 3600_000) >= 100)
        return { ...base, outcome: 'rate_limited' as LogOutcome };
      call.textedAt = now();
      return {
        callId: call.id,
        outcome: 'send',
        firstContact: !others.some((c) => c.textedAt !== null),
      };
    },
    async recordTextSent(callId, body, providerMessageId) {
      touched += 1;
      const call = calls.find((c) => c.id === callId);
      if (call) call.status = 'texted';
      messages.push({ callId, direction: 'out', body, providerMessageId, at: now() });
    },
    ...memoryReplies({ calls, messages, blocked, key, now, touch: () => (touched += 1) }),
    async releaseTextClaim(callId) {
      touched += 1;
      const call = calls.find((c) => c.id === callId);
      if (call) call.textedAt = null;
    },
    ...blocklistViews(blocked, key, () => (touched += 1)),
  };

  return {
    store,
    calls,
    messages,
    block: (lineId: string, number: string, reason = 'junk') =>
      blocked.set(key(lineId, number), reason),
    /** How many store methods ran. Zero means nothing touched the database. */
    get touched() {
      return touched;
    },
  };
}

/** The two views of the block list: the send guard (any block) and the STOP list (opted_out only). */
function blocklistViews(
  blocked: Map<string, string>,
  key: (lineId: string, n: string) => string,
  touch: () => void,
): Pick<MissedCallStore, 'optOuts' | 'stopList'> {
  return {
    optOuts(lineId): OptOutStore {
      return {
        async isOptedOut(number: E164) {
          touch();
          return blocked.has(key(lineId, number));
        },
        async setOptedOut() {
          throw new Error('optOuts is read-only; use stopList');
        },
      };
    },
    stopList(lineId): OptOutStore {
      return {
        async isOptedOut(number: E164) {
          touch();
          return blocked.get(key(lineId, number)) === 'opted_out';
        },
        async setOptedOut(number: E164, optedOut: boolean) {
          touch();
          if (optedOut) blocked.set(key(lineId, number), 'opted_out');
          else if (blocked.get(key(lineId, number)) === 'opted_out')
            blocked.delete(key(lineId, number));
        },
      };
    },
  };
}

interface ReplyContext {
  calls: MemoryCall[];
  messages: MemoryMessage[];
  blocked: Map<string, string>;
  key: (lineId: string, n: string) => string;
  now: () => Date;
  touch: () => void;
}

/** recordReply and claimHelpReply, mirroring missed_call.record_reply and claim_help_reply. */
function memoryReplies(ctx: ReplyContext): Pick<MissedCallStore, 'recordReply' | 'claimHelpReply'> {
  const { calls, messages, blocked, key, now } = ctx;
  return {
    async recordReply(lineId, caller, body, providerMessageId) {
      ctx.touch();
      const dup = messages.find((m) => m.providerMessageId === providerMessageId);
      if (dup) return { callId: dup.callId, outcome: 'duplicate' };
      const reason = blocked.get(key(lineId, caller));
      if (reason === 'junk' || reason === 'manual') return { callId: null, outcome: 'blocked' };
      const latest = calls.filter((c) => c.lineId === lineId && c.caller === caller).at(-1);
      if (!latest) return { callId: null, outcome: 'no_call' };
      const inbound = messages.filter((m) => m.direction === 'in');
      const lineOf = (m: { callId: string }) => calls.find((c) => c.id === m.callId);
      const within = (ms: number, mine: boolean) =>
        inbound.filter(
          (m) =>
            lineOf(m)?.lineId === lineId &&
            (!mine || lineOf(m)?.caller === caller) &&
            m.at.getTime() > now().getTime() - ms,
        ).length;
      const limited =
        within(3600_000, true) >= 5 ||
        within(24 * 3600_000, true) >= 20 ||
        within(3600_000, false) >= 30;
      messages.push({
        callId: latest.id,
        direction: 'in',
        body,
        providerMessageId,
        at: now(),
      });
      if (latest.status === 'missed' || latest.status === 'texted') latest.status = 'replied';
      return { callId: latest.id, outcome: limited ? 'rate_limited' : 'recorded' };
    },
    async claimHelpReply(lineId, caller, body) {
      ctx.touch();
      const latest = calls.filter((c) => c.lineId === lineId && c.caller === caller).at(-1);
      if (!latest) return false;
      const asked = messages.some(
        (m) =>
          m.direction === 'out' &&
          m.body === body &&
          calls.find((c) => c.id === m.callId)?.caller === caller &&
          m.at.getTime() > now().getTime() - 24 * 3600_000,
      );
      if (asked) return false;
      messages.push({
        callId: latest.id,
        direction: 'out',
        body,
        providerMessageId: `help-${messages.length}`,
        at: now(),
      });
      return true;
    },
  };
}
