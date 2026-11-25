/**
 * Twilio signs the exact public URL it posts to. In production that URL must be configured, not
 * guessed: APP_URL defaults to localhost, so leaving SMS_WEBHOOK_PUBLIC_URL out would make every
 * real webhook fail its signature check. Returns what is wrong, or null.
 */
export function webhookUrlProblem(input: {
  smsProvider: 'twilio' | 'fake';
  nodeEnv: string | undefined;
  publicUrl?: string | undefined;
}): string | null {
  if (input.smsProvider !== 'twilio' || input.nodeEnv !== 'production') return null;
  if (!input.publicUrl) {
    return 'SMS_WEBHOOK_PUBLIC_URL is required in production, e.g. https://missed-call.naplesaiagency.com';
  }
  let url: URL;
  try {
    url = new URL(input.publicUrl);
  } catch {
    return 'SMS_WEBHOOK_PUBLIC_URL is not a valid URL.';
  }
  if (url.protocol !== 'https:') return 'SMS_WEBHOOK_PUBLIC_URL must start with https://.';
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return 'SMS_WEBHOOK_PUBLIC_URL cannot be localhost in production.';
  }
  return null;
}
