import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

// If anything the practice code pulls in loads the Twilio SDK, this factory runs and the test fails.
const twilioLoaded = vi.hoisted(() => vi.fn());
vi.mock('twilio', () => {
  twilioLoaded();
  throw new Error('The Twilio SDK was loaded by practice mode.');
});

const SRC = fileURLToPath(new URL('../../src', import.meta.url));

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const sourceFiles = filesUnder(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const practiceFiles = sourceFiles.filter(
  (f) => f.includes('/features/practice/') || f.includes('/app/rain-day/practice/'),
);

describe('practice mode cannot reach a carrier', () => {
  it('loading and running the practice send path never loads the Twilio SDK or constructs a client', async () => {
    const { practiceProvider } = await import('@speedy/sms/practice');
    await import('@/features/practice/core');
    await import('@/features/practice/gate');
    const { dispatchMessages } = await import('@/features/rain-day/dispatch');

    const saved: { to: string; body: string }[] = [];
    const provider = practiceProvider({
      add: async (m) => {
        saved.push({ to: m.to, body: m.body });
        return { id: String(saved.length) };
      },
    });
    const outcome = await dispatchMessages({
      provider,
      store: { isOptedOut: async () => false, markResult: async () => undefined },
      rows: [
        { id: 'a', customerId: 'a', phone: '+12395550123', body: 'Hi Maria', isFirstContact: true },
        { id: 'b', customerId: 'b', phone: '+12395550124', body: 'Hi Jim', isFirstContact: false },
      ],
      sender: { from: '+12395550100' },
      businessName: 'Green Gulf Lawn',
    });
    expect(outcome).toEqual({ sent: 2, failed: 0, skipped: 0 });
    expect(saved.map((s) => s.to)).toEqual(['+12395550123', '+12395550124']);
    expect(provider.name).toBe('practice');
    expect(twilioLoaded).not.toHaveBeenCalled();
  });

  it('practice files import no carrier SDK, no real provider and no HTTP client, and do not call fetch', () => {
    expect(practiceFiles.length).toBeGreaterThan(8);
    const forbidden = [
      /from ['"]twilio['"]/,
      /from ['"]@\/config\/sms['"]/,
      /from ['"]@speedy\/sms\/(twilio|create|fake)['"]/,
      /from ['"](node:)?(https?|net|tls)['"]/,
      /from ['"](undici|axios|node-fetch)['"]/,
      /\bfetch\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /dangerouslySetInnerHTML/,
    ];
    for (const file of practiceFiles) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of forbidden)
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
    }
  });

  it('only the practice files may use the practice provider, so a real path can never be given one', () => {
    const users = sourceFiles.filter((f) =>
      readFileSync(f, 'utf8').includes('@speedy/sms/practice'),
    );
    expect(users.every((f) => f.includes('/features/practice/'))).toBe(true);
    expect(users.length).toBeGreaterThan(0);
    // The real provider factory knows nothing about practice and has no env or cache switch for it.
    const real = readFileSync(join(SRC, 'config/sms.ts'), 'utf8');
    expect(real).not.toMatch(/practice/i);
  });

  it('practice mode has no webhook or public endpoint of its own', () => {
    const routes = sourceFiles.filter((f) => f.endsWith('/route.ts'));
    expect(routes.some((f) => /practice/i.test(relative(SRC, f)))).toBe(false);
    expect(
      sourceFiles
        .filter((f) => f.includes('/api/'))
        .every((f) => !/practice/i.test(readFileSync(f, 'utf8'))),
    ).toBe(true);
  });
});
