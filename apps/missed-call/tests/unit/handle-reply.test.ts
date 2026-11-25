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
  ownerCellVerified: true,
  messagingServiceSid: null,
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
    expect(sms.sent[0]?.body.length).toBeLessThanOrEqual(300);
  });

  it('after Junk, a reply and a new call from the number get no texts', async () => {
    mem.block(line.id, CALLER, 'junk');
    await reply(text('hi'));
    await miss();
    expect(sms.sent).toHaveLength(0);
  });

  it('ignores a text from a Canadian or Caribbean number: nothing saved, nothing forwarded', async () => {
    for (const from of ['+14165550123', '+18765550123', '+17875550123']) {
      await reply(text('hello', { from: from as InboundMessage['from'] }));
    }
    expect(sms.sent).toHaveLength(0);
    expect(mem.messages.filter((m) => m.direction === 'in')).toHaveLength(0);
  });

  it('saves the reply but does not forward it when the owner cell is not a US number', async () => {
    mem = memoryStore([{ ...line, ownerCell: '+14165550101' }]);
    await miss();
    sms.reset();
    await reply(text('need a quote'));
    expect(mem.calls[0]?.status).toBe('replied');
    expect(sms.sent).toHaveLength(0);
  });
});

describe('handleReply keywords and caps', () => {
  it('saves the reply but does not forward it while the owner cell is unverified', async () => {
    mem = memoryStore([{ ...line, ownerCellVerified: false }]);
    await miss();
    sms.reset();
    await reply(text('need a quote'));
    expect(mem.calls[0]?.status).toBe('replied');
    expect(mem.messages.filter((m) => m.direction === 'in')).toHaveLength(1);
    expect(sms.sent).toHaveLength(0);
  });

  it('records and forwards a plain "Yes" from someone who never texted STOP', async () => {
    await reply(text('Yes'));
    expect(mem.calls[0]?.status).toBe('replied');
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]?.body).toBe('New lead from (239) 555-0123: Yes');
    await reply(text('unstop'));
    expect(sms.sent).toHaveLength(2);
  });

  it('treats YES from a number that texted STOP as opting back in, not as a lead', async () => {
    await reply(text('STOP'));
    await reply(text('YES'));
    expect(await mem.store.stopList(line.id).isOptedOut(CALLER)).toBe(false);
    expect(sms.sent).toHaveLength(0);
  });

  it('a STOP replaces a junk block, so un-junking later does not re-enable texts', async () => {
    mem.block(line.id, CALLER, 'junk');
    await reply(text('STOP'));
    expect(await mem.store.stopList(line.id).isOptedOut(CALLER)).toBe(true);
  });

  it('records and forwards a reply from a number that texted STOP', async () => {
    mem.block(line.id, CALLER, 'opted_out');
    await reply(text('actually yes, tomorrow works'));
    expect(mem.calls[0]?.status).toBe('replied');
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]?.to).toBe(OWNER);
  });

  it('answers HELP only to a number that called, and once a day', async () => {
    await reply(text('HELP', { from: '+12395550999' }));
    expect(sms.sent).toHaveLength(0);
    await reply(text('HELP'));
    await reply(text('help'));
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]?.to).toBe(CALLER);
  });

  it('forwards the first 5 replies an hour from one caller and saves the rest', async () => {
    for (let i = 0; i < 8; i += 1)
      await reply(text(`reply ${i}`, { providerMessageId: `SMA${i}` }));
    expect(sms.sent).toHaveLength(5);
    expect(mem.messages.filter((m) => m.direction === 'in')).toHaveLength(8);
  });

  it('stops forwarding for the whole line after 30 replies in an hour', async () => {
    for (let c = 0; c < 8; c += 1) {
      const from = `+1239555${String(2000 + c)}` as InboundMessage['from'];
      await mem.store.logMissedCall(line.id, from, `CAline${c}`, true);
      for (let i = 0; i < 5; i += 1)
        await reply(text(`hi ${i}`, { from, providerMessageId: `SML${c}-${i}` }));
    }
    expect(sms.sent).toHaveLength(30);
    expect(mem.messages.filter((m) => m.direction === 'in')).toHaveLength(40);
  });

  it('cuts a long lead at 300 characters without splitting an emoji', async () => {
    await reply(text('🔧'.repeat(500)));
    const body = sms.sent[0]?.body ?? '';
    expect(Array.from(body).length).toBeLessThanOrEqual(300);
    expect(body.endsWith('…')).toBe(true);
    expect(body).not.toContain('\ufffd');
  });

  it('frees the HELP claim when the answer fails to send, so the next HELP is answered', async () => {
    sms.failNext();
    await reply(text('HELP'));
    expect(sms.sent).toHaveLength(0);
    await reply(text('HELP'));
    expect(sms.sent).toHaveLength(1);
  });

  it('START lifts a STOP but keeps the number blocked while a Junk call remains', async () => {
    mem.calls[0]!.status = 'junk';
    mem.block(line.id, CALLER, 'opted_out');
    await reply(text('START'));
    expect(await mem.store.stopList(line.id).isOptedOut(CALLER)).toBe(false);
    expect(await mem.store.optOuts(line.id).isOptedOut(CALLER)).toBe(true);
    mem.calls[0]!.status = 'replied';
    mem.block(line.id, CALLER, 'opted_out');
    await reply(text('START'));
    expect(await mem.store.optOuts(line.id).isOptedOut(CALLER)).toBe(false);
  });

  it('stores at most 50 replies a day from one caller and 200 a day for the line', async () => {
    for (let i = 0; i < 60; i += 1) await reply(text(`r${i}`, { providerMessageId: `SMD${i}` }));
    expect(mem.messages.filter((m) => m.direction === 'in')).toHaveLength(50);
    expect(sms.sent).toHaveLength(5);
  });

  it('forwards the lead and answers HELP through the line Messaging Service', async () => {
    mem = memoryStore([{ ...line, messagingServiceSid: 'MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }]);
    await miss();
    sms.reset();
    await reply(text('need a quote'));
    await reply(text('HELP'));
    expect(sms.sent).toHaveLength(2);
    for (const sent of sms.sent) {
      expect(sent).toMatchObject({
        from: LINE_NUMBER,
        messagingServiceSid: 'MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      });
    }
  });
});
