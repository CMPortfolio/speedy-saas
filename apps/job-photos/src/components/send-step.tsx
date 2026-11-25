'use client';

import { useState } from 'react';

import { Button } from '@speedy/ui/button';

export interface SendStepProps {
  shareUrl: string;
  businessName: string;
  before: number;
  after: number;
  onAnother: () => void;
}

type CopyState = 'idle' | 'copied' | 'failed';

function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The last step: hand the link to the customer. The phone's share sheet when the browser has
 * one (iOS Safari, Android Chrome), otherwise a Copy link button with a visible "Copied" state.
 */
export function SendStep({ shareUrl, businessName, before, after, onAnother }: SendStepProps) {
  const [copy, setCopy] = useState<CopyState>('idle');
  const [shareSupported] = useState(canShare);

  const share = async () => {
    const text = businessName
      ? `${businessName}: before and after photos of your job`
      : 'Before and after photos of your job';
    try {
      await navigator.share({ title: text, text, url: shareUrl });
    } catch (e) {
      // The owner closed the sheet: nothing to do. Anything else: fall back to copying.
      if ((e as { name?: string }).name !== 'AbortError') await handleCopy();
    }
  };

  const handleCopy = async () => {
    setCopy((await copyText(shareUrl)) ? 'copied' : 'failed');
  };

  return (
    <div className="space-y-5">
      <p className="text-muted">
        {before} before and {after} after photos are ready. The customer opens one link and sees
        them side by side.
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">The link</span>
        <input
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          data-testid="share-url"
          className="min-h-tap w-full rounded-brand border border-border bg-surface px-3 text-base text-ink"
        />
      </label>
      {shareSupported ? (
        <Button type="button" size="lg" fullWidth onClick={() => void share()} data-testid="send">
          Send the link
        </Button>
      ) : null}
      <Button
        type="button"
        size="lg"
        fullWidth
        variant={shareSupported ? 'secondary' : 'primary'}
        onClick={() => void handleCopy()}
        data-testid="copy-link"
        aria-live="polite"
      >
        {copy === 'copied' ? 'Copied' : 'Copy link'}
      </Button>
      {copy === 'failed' ? (
        <p role="alert" className="text-sm text-danger">
          Could not copy. Tap the link above, then copy it.
        </p>
      ) : null}
      <a
        href={shareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-tap items-center justify-center text-base font-medium text-primary underline-offset-4 hover:underline"
      >
        See what the customer sees
      </a>
      <Button type="button" variant="ghost" size="lg" fullWidth onClick={onAnother}>
        Start another job
      </Button>
    </div>
  );
}
