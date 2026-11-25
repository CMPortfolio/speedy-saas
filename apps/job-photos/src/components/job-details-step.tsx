'use client';

import Image from 'next/image';
import { useId, useState, type ChangeEvent, type FormEvent } from 'react';

import { resizeImage } from '@speedy/lib/photos';
import { Button } from '@speedy/ui/button';
import { cn } from '@speedy/ui/cn';
import { Input } from '@speedy/ui/input';

import { LOGO_MAX_EDGE } from '@/config/constants';
import type { DeviceBusiness } from '@/hooks/use-device-business';

export interface JobDetailsValues {
  title: string;
  businessName: string;
  logoDataUrl: string | null;
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

/** Step 1: optional job name, business name and logo. Business details are remembered on the phone. */
export function JobDetailsStep({
  business,
  onBusinessChange,
  busy,
  error,
  onContinue,
}: JobDetailsStepProps) {
  const [title, setTitle] = useState('');
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoId = useId();

  const handleLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLogoError(null);
    try {
      const { blob } = await resizeImage(file, { maxEdge: LOGO_MAX_EDGE, type: 'image/png' });
      onBusinessChange({ logoDataUrl: await toDataUrl(blob) });
    } catch {
      setLogoError('We could not read that image. Try a JPEG or PNG.');
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onContinue({
      title: title.trim(),
      businessName: business.name.trim(),
      logoDataUrl: business.logoDataUrl,
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
      <div className="flex items-center gap-3">
        {business.logoDataUrl ? (
          <Image
            src={business.logoDataUrl}
            alt="Your logo"
            width={56}
            height={56}
            unoptimized
            className="size-14 rounded-brand border border-border object-contain bg-surface"
          />
        ) : null}
        <label
          htmlFor={logoId}
          className={cn(
            'inline-flex min-h-tap cursor-pointer items-center rounded-brand border border-border bg-surface px-4 text-base font-medium text-ink hover:bg-background',
            'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
          )}
        >
          {business.logoDataUrl ? 'Change logo' : 'Add your logo (optional)'}
          <input
            id={logoId}
            type="file"
            accept="image/*"
            onChange={handleLogo}
            className="sr-only"
          />
        </label>
        {business.logoDataUrl ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onBusinessChange({ logoDataUrl: null })}
          >
            Remove
          </Button>
        ) : null}
      </div>
      {logoError ? (
        <p role="alert" className="text-sm text-danger">
          {logoError}
        </p>
      ) : null}
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
