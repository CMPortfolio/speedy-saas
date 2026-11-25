import type {
  PracticeCall,
  PracticeDirection,
  PracticeMessageRow,
  PracticeStatus,
  PracticeStore,
  Reservation,
} from '../../src/features/practice/practice-store';

/** In-memory PracticeStore for unit tests: one owner, the same rules as the SQL function. */
export function memoryPracticeStore(options: { actionLimit?: number; maxMessages?: number } = {}) {
  const calls: (PracticeCall & { owner: string })[] = [];
  const messages: PracticeMessageRow[] = [];
  let actions = 0;
  let clock = 0;
  const limit = options.actionLimit ?? 60;
  const max = options.maxMessages ?? 400;

  const store: PracticeStore = {
    async reserve(): Promise<Reservation> {
      if (actions >= limit) return 'rate_limited';
      if (messages.length >= max) return 'full';
      actions += 1;
      return 'ok';
    },
    async callsFor(caller) {
      return calls.filter((c) => c.callerNumber === caller).reverse();
    },
    async getCall(id) {
      return calls.find((c) => c.id === id) ?? null;
    },
    async addCall(caller, now) {
      const id = `pc${calls.length + 1}`;
      calls.push({
        id,
        owner: 'me',
        callerNumber: caller,
        receivedAt: now.toISOString(),
        status: 'missed',
        textedAt: null,
        optedOut: false,
      });
      return id;
    },
    async markTexted(callId, now) {
      const c = calls.find((x) => x.id === callId);
      if (c) {
        c.textedAt = now.toISOString();
        c.status = 'texted';
      }
    },
    async setStatus(callId, status: PracticeStatus) {
      const c = calls.find((x) => x.id === callId);
      if (c) c.status = status;
    },
    async setOptedOut(caller, optedOut) {
      for (const c of calls) if (c.callerNumber === caller) c.optedOut = optedOut;
    },
    async addMessage(callId, direction: PracticeDirection, body) {
      clock += 1;
      const id = `pm${messages.length + 1}`;
      messages.push({
        id,
        callId,
        direction,
        body,
        createdAt: new Date(clock * 1000).toISOString(),
      });
      return { id };
    },
    async callers() {
      return calls.map((c) => c.callerNumber).reverse();
    },
    async prune(before) {
      const gone = new Set(
        calls.filter((c) => Date.parse(c.receivedAt) < before.getTime()).map((c) => c.id),
      );
      calls.splice(0, calls.length, ...calls.filter((c) => !gone.has(c.id)));
      messages.splice(0, messages.length, ...messages.filter((m) => !gone.has(m.callId)));
    },
    async clear() {
      calls.length = 0;
      messages.length = 0;
    },
  };
  return {
    store,
    calls,
    messages,
    get actions() {
      return actions;
    },
  };
}
