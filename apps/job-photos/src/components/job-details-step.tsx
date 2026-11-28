'use client';

import Image from 'next/image';
import { useId, useState, type ChangeEvent, type FormEvent } from 'react';

import { resizeImage } from '@speedy/lib/photos';
import { Button } from '@speedy/ui/button';
import { cn } from '@speedy/ui/cn';
import { Input } from '@speedy/ui/input';

import { LOGO_MAX_EDGE } from '@/config/constants';
import { checkReviewUrl } from '@/features/jobs/review-url';
import type { DeviceBusiness } from '@/hooks/use-device-business';

export interface JobDetailsValues {
  title: string;
  businessName: string;
  logoDataUrl: string | null;
  reviewUrl: string | null;
}

export interface JobDetailsStepProps {
  business: DeviceBusiness;
  onBusinessChange: (patch: Partial<DeviceBusiness>) => void;
  busy: boolean;
  error: string | null;
  onContinue: (values: JobDetailsValues) => void;
}

async function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the logo'));
    reader.readAsDataURL(blob);
  });
}

interface LogoPickerProps {
  logoDataUrl: string | null;
  onChange: (logoDataUrl: string | null) => void;
}

/** Optional logo, shrunk in the browser and kept on the phone as a small data URL. */
function LogoPicker({ logoDataUrl, onChange }: LogoPickerProps) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);

  const handleLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const { blob } = await resizeImage(file, { maxEdge: LOGO_MAX_EDGE, type: 'image/png' });
      onChange(await toDataUrl(blob));
    } catch {
      setError('We could not read that image. Try a JPEG or PNG.');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {logoDataUrl ? (
          <Image
            src={logoDataUrl}
            alt="Your logo"
            width={56}
            height={56}
            unoptimized
            className="size-14 rounded-brand border border-border bg-surface object-contain"
          />
        ) : null}
        <label
          htmlFor={id}
          className={cn(
            'inline-flex min-h-tap cursor-pointer items-center rounded-brand border border-border bg-surface px-4 text-base font-medium text-ink hover:bg-background',
            'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
          )}
        >
          {logoDataUrl ? 'Change logo' : 'Add your logo (optional)'}
          <input id={id} type="file" accept="image/*" onChange={handleLogo} className="sr-only" />
        </label>
        {logoDataUrl ? (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            Remove
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Step 1: optional job name, business name, logo and review link. Business details are remembered on the phone. */
export function JobDetailsStep({
  business,
  onBusinessChange,
  busy,
  error,
  onContinue,
}: JobDetailsStepProps) {
  const [title, setTitle] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const review = checkReviewUrl(business.reviewUrl);
    if (review && !review.ok) {
      setReviewError(review.message);
      return;
    }
    setReviewError(null);
    onContinue({
      title: title.trim(),
      businessName: business.name.trim(),
      logoDataUrl: business.logoDataUrl,
      reviewUrl: review ? review.url : null,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Input
        label="Job name (optional)"
        hint="For you, not the customer. E.g. “Smith kitchen drain”."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        autoComplete="off"
        enterKeyHint="next"
      />
      <Input
        label="Your business name"
        hint="Shows at the top of the page your customer sees. We remember it on this phone."
        value={business.name}
        onChange={(e) => onBusinessChange({ name: e.target.value })}
        maxLength={120}
        autoComplete="organization"
      />
      <LogoPicker
        logoDataUrl={business.logoDataUrl}
        onChange={(logoDataUrl) => onBusinessChange({ logoDataUrl })}
      />
      <Input
        label="Link for reviews (optional)"
        hint="Your Google or Yelp review link. The customer gets a “Leave a review” button."
        type="url"
        inputMode="url"
        autoComplete="url"
        placeholder="https://g.page/r/…"
        value={business.reviewUrl ?? ''}
        onChange={(e) => {
          setReviewError(null);
          onBusinessChange({ reviewUrl: e.target.value || null });
        }}
        error={reviewError}
      />
      {error ? (
        <p
          role="alert"
          className="rounded-brand border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" fullWidth loading={busy} data-testid="details-next">
        Next: before photos
      </Button>
    </form>
  );
}
