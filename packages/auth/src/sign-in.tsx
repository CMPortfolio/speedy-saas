'use client';

import { useActionState } from 'react';

import { sendMagicLink, type SendMagicLinkState } from './actions';

export interface SignInFormProps {
  /** Where to go after the link is clicked. Same-origin path. */
  next?: string;
  /** Shown above the form, e.g. "Save your jobs". */
  title?: string;
  /** One line on why sign-in is needed here. */
  reason?: string;
  /** Set when the callback failed (`?error=link`). */
  linkError?: boolean;
}

const initial: SendMagicLinkState = { status: 'idle' };

/**
 * Magic-link sign-in form. Plain markup with the house tokens so it works in every tool;
 * apps wrap it in their shell. Labels and 44px targets per the accessibility rules.
 */
export function SignInForm({
  next = '/',
  title = 'Sign in',
  reason,
  linkError = false,
}: SignInFormProps) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === 'sent') {
    return (
      <section aria-live="polite" className="space-y-2">
        <h1 className="text-3xl text-ink">Check your email</h1>
        <p className="text-muted">
          We sent a sign-in link to <strong className="text-ink">{state.email}</strong>. Open it on
          this phone to continue. The link works for one hour.
        </p>
      </section>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1">
        <h1 className="text-3xl text-ink">{title}</h1>
        {reason ? <p className="text-muted">{reason}</p> : null}
      </div>
      {linkError ? (
        <p
          role="alert"
          className="rounded-brand border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          That link has expired or was already used. Enter your email to get a new one.
        </p>
      ) : null}
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1">
        <label htmlFor="sign-in-email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="sign-in-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@yourbusiness.com"
          aria-describedby={state.status === 'error' ? 'sign-in-error' : undefined}
          aria-invalid={state.status === 'error' || undefined}
          className="min-h-tap w-full rounded-brand border border-field bg-surface px-3 text-base text-ink placeholder:text-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand"
        />
        {state.status === 'error' ? (
          <p id="sign-in-error" role="alert" className="text-sm text-danger">
            {state.message}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-tap w-full rounded-brand bg-primary px-5 text-[0.95rem] font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Sending link…' : 'Email me a sign-in link'}
      </button>
      <p className="text-sm text-muted">No password. We email you a link that signs you in.</p>
    </form>
  );
}
