import { Resend } from 'resend';

import { logger } from './logger';
import { appError, err, ok, type Result } from './result';

/**
 * Resend client with a guard: outside production, mail only goes to Resend's test addresses
 * (anything @resend.dev, for example delivered@resend.dev) or to addresses on an allowlist.
 * Everything else is logged and dropped, so development and tests never email a real person.
 */
export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface EmailClientOptions {
  apiKey?: string | undefined;
  /** Default from address, e.g. "Naples AI <hello@naplesaiagency.com>". */
  from: string;
  /** Defaults to NODE_ENV === "production". */
  isProduction?: boolean;
  /** Extra non-production recipients that are allowed (your own inbox, say). */
  allowlist?: readonly string[];
}

export interface EmailClient {
  send(input: SendEmailInput): Promise<Result<{ id: string | null }>>;
  /** Whether this address would be delivered given the current environment. */
  isAllowed(address: string): boolean;
}

export const RESEND_TEST_DOMAIN = 'resend.dev';

export function isResendTestAddress(address: string): boolean {
  return address.trim().toLowerCase().endsWith(`@${RESEND_TEST_DOMAIN}`);
}

export function createEmailClient(options: EmailClientOptions): EmailClient {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';
  const allowlist = new Set((options.allowlist ?? []).map((a) => a.toLowerCase()));
  const resend = options.apiKey ? new Resend(options.apiKey) : null;
  const log = logger.child({ module: 'email' });

  const isAllowed = (address: string): boolean =>
    isProduction || isResendTestAddress(address) || allowlist.has(address.trim().toLowerCase());

  return {
    isAllowed,
    async send(input) {
      const recipients = Array.isArray(input.to) ? input.to : [input.to];
      const blocked = recipients.filter((r) => !isAllowed(r));
      if (blocked.length > 0) {
        log.warn('email dropped outside production', {
          subject: input.subject,
          blocked: blocked.length,
        });
        return err(
          appError('email_blocked', 'Email is only sent to test addresses outside production.'),
        );
      }
      if (!resend) {
        log.warn('email skipped: no RESEND_API_KEY', { subject: input.subject });
        return ok({ id: null });
      }
      const { data, error } = await resend.emails.send({
        from: input.from ?? options.from,
        to: recipients,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      });
      if (error) {
        log.error('email failed', { subject: input.subject, error: error.message });
        return err(appError('email_failed', 'The email could not be sent.', error));
      }
      return ok({ id: data?.id ?? null });
    },
  };
}
