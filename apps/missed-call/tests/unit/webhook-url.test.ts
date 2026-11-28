import { describe, expect, it } from 'vitest';

import { webhookUrlProblem } from '../../src/config/webhook-url';

describe('webhookUrlProblem', () => {
  const base = { smsProvider: 'twilio' as const, nodeEnv: 'production' };

  it('is fine with an https public URL in production', () => {
    expect(
      webhookUrlProblem({ ...base, publicUrl: 'https://missed-call.naplesaiagency.com' }),
    ).toBeNull();
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('requires SMS_WEBHOOK_PUBLIC_URL with Twilio in production (%s)', (_n, publicUrl) => {
    expect(webhookUrlProblem({ ...base, publicUrl })).toMatch(/SMS_WEBHOOK_PUBLIC_URL/);
  });

  it('refuses a plain http or localhost public URL in production', () => {
    expect(
      webhookUrlProblem({ ...base, publicUrl: 'http://missed-call.naplesaiagency.com' }),
    ).toMatch(/https/);
    expect(webhookUrlProblem({ ...base, publicUrl: 'https://localhost:3002' })).toMatch(
      /localhost/,
    );
  });

  it('does not ask for it in development or with the fake provider', () => {
    expect(webhookUrlProblem({ smsProvider: 'twilio', nodeEnv: 'development' })).toBeNull();
    expect(webhookUrlProblem({ smsProvider: 'fake', nodeEnv: 'production' })).toBeNull();
  });
});
