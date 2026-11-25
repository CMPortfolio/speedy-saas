import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appError } from '@speedy/lib/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { practiceProvider, type PracticeMessage, type PracticeSink } from './practice';

function memorySink() {
  const messages: (PracticeMessage & { id: string })[] = [];
  const sink: PracticeSink = {
    async add(message) {
      const id = `p${messages.length + 1}`;
      messages.push({ ...message, id });
      return { id };
    },
  };
  return { sink, messages };
}

const text = { to: '+12395550123', from: '+12395550100', body: 'Hi' } as const;

afterEach(() => vi.restoreAllMocks());

describe('practiceProvider', () => {
  it('writes each text to the sink and returns an id that says it was practice', async () => {
    const { sink, messages } = memorySink();
    const p = practiceProvider(sink);
    expect(p.name).toBe('practice');
    const r = await p.sendText({ ...text, messagingServiceSid: 'MG' + 'a'.repeat(32) });
    expect(r).toEqual({ ok: true, value: { providerMessageId: 'practice-p1' } });
    expect(messages).toEqual([{ ...text, messagingServiceSid: 'MG' + 'a'.repeat(32), id: 'p1' }]);
  });

  it('never opens a network connection: sending does not call fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network used'));
    const { sink } = memorySink();
    const p = practiceProvider(sink);
    await p.sendText(text);
    await p.sendText({ ...text, body: 'Again' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('turns a sink failure into a provider_failed result instead of throwing', async () => {
    const p = practiceProvider({
      add: async () => {
        throw new Error('db down');
      },
    });
    const r = await p.sendText(text);
    expect(!r.ok && r.error.code).toBe('provider_failed');
  });

  it('has no webhooks: nothing it is shown is ever trusted as a provider event', () => {
    const p = practiceProvider(memorySink().sink);
    const req = { headers: { 'x-twilio-signature': 'anything' }, rawBody: '{}', url: 'https://x' };
    expect(p.verifySignature(req)).toBe(false);
    const parsed = p.parseInbound(req);
    expect(!parsed.ok && parsed.error.code).toBe('invalid_webhook');
  });

  it('keeps provider errors the sink raises on purpose, such as an invalid number', async () => {
    const p = practiceProvider({
      add: async () => {
        throw appError('invalid_number', 'That number cannot receive texts.');
      },
    });
    const r = await p.sendText(text);
    expect(!r.ok && r.error.code).toBe('invalid_number');
  });
});

describe('the practice provider source cannot reach a carrier', () => {
  const source = readFileSync(join(import.meta.dirname, 'practice.ts'), 'utf8');
  const imports = [...source.matchAll(/^import[^;]*from '([^']+)'/gm)].map((m) => m[1]);

  it('imports only types from this package and the shared result and logger helpers', () => {
    expect(imports.sort()).toEqual(
      ['./provider', '@speedy/lib/logger', '@speedy/lib/phone', '@speedy/lib/result'].sort(),
    );
  });

  it.each([
    'twilio',
    'fetch(',
    'node:http',
    'node:https',
    'node:net',
    'XMLHttpRequest',
    'WebSocket',
  ])('does not mention %s outside comments', (word) => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain(word);
  });
});
