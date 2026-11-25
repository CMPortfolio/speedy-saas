import { fakeProvider } from '@speedy/sms/fake';
import type { InboundMessage } from '@speedy/sms/provider';
import { beforeEach, describe, expect, it } from 'vitest';

import { handleMissedCall } from '../../src/features/missed-calls/handle-missed-call';
import { handleReply } from '../../src/features/missed-calls/handle-reply';
import type { LineRecord } from '../../src/features/missed-calls/store';
import { memoryStore } from './memory-store';

const LINE_NUMBER = '+12395550100';
const CALLER = '+12395550123';
const OWNER = '+12395550101';

const line: LineRecord = {
  id: 'line-1',
  providerNumber: LINE_NUMBER,
  ownerCell: OWNER,
  businessName: 'Gulf Coast Plumbing',
  template: 'Sorry we missed your call. What do you need?',
  afterHoursTemplate: null,
  quietHours: null,
  timezone: 'America/New_York',
};

const text = (body: string, over: Partial<InboundMessage> = {}): InboundMessage => ({
  kind: 'inbound',
  from: CALLER,
  to: LINE_NUMBER,
  body,
  providerMessageId: `SM-${body.length}-${Math.random()}`,
  ...over,
});

let sms: ReturnType<typeof fakeProvider>;
let mem: ReturnType<typeof memoryStore>;

const miss = () =>
  handleMissedCall(
    { provider: sms, store: mem.store },
    {
      kind: 'call',
      callSid: `CA${mem.calls.length + 1}`,
      from: CALLER,
      to: LINE_NUMBER,
      status: 'ringing',
      direction: 'inbound',
    },
  );
const reply = (m: InboundMessage) => handleReply({ provider: sms, store: mem.store }, m);

beforeEach(async () => {
  sms = fakeProvider();
  mem = memoryStore([line]);
  await miss();
  sms.reset();
});

describe('handleReply', () => {
  it('attaches the reply to the latest call, sets replied and forwards it to the owner cell', async () => {
    await reply(text('leaking water heater, garage'));
    expect(mem.calls[0]?.status).toBe('replied');
    expect(mem.messages.filter((m) => m.direction === 'in')).toHaveLength(1);
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]).toMatchObject({
      to: OWNER,
      from: LINE_NUMBER,
      body: 'New lead from (239) 555-0123: leaking water heater, garage',
    });
  });

  it('forwards every reply, but a retried webhook only once', async () => {
    const first = text('first');
    await reply(first);
    await reply(first);
    await reply(text('second, and the address is 12 Palm Ave'));
    expect(sms.sent.map((s) => s.body)).toEqual([
      'New lead from (239) 555-0123: first',
      'New lead from (239) 555-0123: second, and the address is 12 Palm Ave',
    ]);
  });

  it('ignores a text from a number that never called', async () => {
    await reply(text('hello', { from: '+12395550999' }));
    expect(sms.sent).toHaveLength(0);
    expect(mem.messages.filter((m) => m.direction === 'in')).toHaveLength(0);
  });

  it('ignores a text to a number with no line', async () => {
    await reply(text('hello', { to: '+12395550998' }));
    expect(sms.sent).toHaveLength(0);
  });

  it('does not forward or record a reply from a blocked number', async () => {
    mem.block(line.id, CALLER, 'junk');
    await reply(text('call me'));
    expect(sms.sent).toHaveLength(0);
    expect(mem.calls[0]?.status).not.toBe('replied');
  });

  it('STOP blocks the number and is not forwarded; START lifts it', async () => {
    await reply(text('STOP'));
    expect(sms.sent).toHaveLength(0);
    expect(await mem.store.optOuts(line.id).isOptedOut(CALLER)).toBe(true);
    await reply(text('start'));
    expect(await mem.store.optOuts(line.id).isOptedOut(CALLER)).toBe(false);
    expect(sms.sent).toHaveLength(0);
  });

  it('answers HELP to the caller and does not forward it', async () => {
    await reply(text('HELP'));
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]).toMatchObject({ to: CALLER, from: LINE_NUMBER });
    expect(sms.sent[0]?.body).toContain('Gulf Coast Plumbing');
    expect(sms.sent[0]?.body).toContain('STOP');
  });

  it('keeps the reply when forwarding fails', async () => {
    sms.failNext();
    await reply(text('need a quote'));
    expect(mem.calls[0]?.status).toBe('replied');
    expect(sms.sent).toHaveLength(0);
  });

  it('trims very long replies in the forwarded text', async () => {
    await reply(text('x'.repeat(3000)));
    expect(sms.sent[0]?.body.length).toBeLessThanOrEqual(1000);
  });

  it('after Junk, a reply and a new call from the number get no texts', async () => {
    mem.block(line.id, CALLER, 'junk');
    await reply(text('hi'));
    await miss();
    expect(sms.sent).toHaveLength(0);
  });
});
