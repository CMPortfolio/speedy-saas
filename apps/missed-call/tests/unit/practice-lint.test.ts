import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/** The lint rule on the practice folder is what stops a future edit from wiring a carrier in. */
const eslint = new ESLint({ cwd: new URL('../..', import.meta.url).pathname });
const lint = async (code: string, file: string) =>
  (await eslint.lintText(code, { filePath: file }))[0]?.messages ?? [];
const inPractice = 'src/features/practice/example.ts';

describe('lint rules on the practice folder', () => {
  it.each([
    ["import twilio from 'twilio';\nexport const x = twilio;\n", 'the Twilio SDK'],
    [
      "import { getSms } from '@/config/sms';\nexport const x = getSms;\n",
      'the real provider setup',
    ],
    [
      "import { twilioProvider } from '@speedy/sms/twilio';\nexport const x = twilioProvider;\n",
      'the Twilio adapter',
    ],
    [
      "import { createSmsProvider } from '@speedy/sms/create';\nexport const x = createSmsProvider;\n",
      'the provider factory',
    ],
    ["import https from 'node:https';\nexport const x = https;\n", 'node:https'],
    ["export const x = () => fetch('https://example.com');\n", 'fetch'],
    ["export const x = () => globalThis.fetch('https://example.com');\n", 'globalThis.fetch'],
  ])('refuses %s', async (code) => {
    const messages = await lint(code, inPractice);
    expect(messages.some((m) => m.severity === 2 && /^no-restricted-/.test(m.ruleId ?? ''))).toBe(
      true,
    );
  });

  it('allows the same imports outside the practice folder', async () => {
    const messages = await lint(
      "import { getSms } from '@/config/sms';\nexport const x = getSms;\n",
      'src/app/api/example.ts',
    );
    expect(messages.filter((m) => /^no-restricted-/.test(m.ruleId ?? ''))).toEqual([]);
  });

  it('is clean for the real practice files', async () => {
    const results = await eslint.lintFiles(['src/features/practice/**/*.{ts,tsx}']);
    const errors = results.flatMap((r) => r.messages.filter((m) => m.severity === 2));
    expect(errors).toEqual([]);
  });
});
