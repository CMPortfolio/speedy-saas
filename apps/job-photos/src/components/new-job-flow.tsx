'use client';

import { useState } from 'react';

import { rememberClaim } from '@speedy/lib/device-claims';
import { Button } from '@speedy/ui/button';

import { CLAIM_NAMESPACE, type PhotoKind } from '@/config/constants';
import type { CreatedJob } from '@/features/jobs/schemas';
import { useDeviceBusiness } from '@/hooks/use-device-business';
import { usePhotoUploads } from '@/hooks/use-photo-uploads';
import { ApiError, createJobRequest, updateJobRequest, uploadLogoRequest } from '@/lib/api-client';

import { JobDetailsStep, type JobDetailsValues } from './job-details-step';
import { NoteStep } from './note-step';
import { PhotoStep } from './photo-step';

type Step = 'details' | 'before' | 'after' | 'note' | 'done';

const STEPS: Record<Step, { number: number; title: string; hint?: string }> = {
  details: { number: 1, title: 'New job' },
  before: { number: 2, title: 'Before photos', hint: 'How it looked when you arrived. Up to six.' },
  after: { number: 3, title: 'After photos', hint: 'How it looks now. Up to six.' },
  note: { number: 4, title: 'Anything to tell the customer?' },
  done: { number: 4, title: 'Saved' },
};

function messageFor(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** The whole on-site flow: details, before, after, note. Each photo uploads as soon as it is picked. */
export function NewJobFlow() {
  const [step, setStep] = useState<Step>('details');
  const [job, setJob] = useState<CreatedJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [business, setBusiness, businessLoaded] = useDeviceBusiness();
  const { photos, addPhotos, uploading, saved, reset } = usePhotoUploads();

  const startAnother = () => {
    reset();
    setJob(null);
    setError(null);
    setStep('details');
  };

  const run = async (work: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(messageFor(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const start = (values: JobDetailsValues) =>
    run(async () => {
      const created = await createJobRequest({
        title: values.title || null,
        business_name: values.businessName || null,
      });
      rememberClaim(CLAIM_NAMESPACE, created.id, created.claimToken);
      setJob(created);
      if (values.logoDataUrl) {
        // The logo is a nicety: a failure here must not stop the job.
        uploadLogoRequest(created, await dataUrlToBlob(values.logoDataUrl)).catch(() => undefined);
      }
      setStep('before');
    }, 'We could not start the job. Check your signal and try again.');

  const saveNote = (note: string) =>
    run(async () => {
      if (job && note) await updateJobRequest(job, { note });
      setStep('done');
    }, 'We could not save the note. Try again.');

  const photoStep = (kind: PhotoKind) => (
    <PhotoStep
      kind={kind}
      photos={photos[kind]}
      uploading={uploading(kind)}
      saved={saved(kind)}
      onFiles={(files) => {
        if (job) void addPhotos(job, kind, files);
      }}
      onNext={() => setStep(kind === 'before' ? 'after' : 'note')}
    />
  );

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted">Step {STEPS[step].number} of 4</p>
        <h1 className="text-2xl font-semibold leading-tight">{STEPS[step].title}</h1>
        {STEPS[step].hint ? <p className="text-muted">{STEPS[step].hint}</p> : null}
      </header>

      {step === 'details' && (
        <JobDetailsStep
          business={business}
          onBusinessChange={setBusiness}
          busy={busy || !businessLoaded}
          error={error}
          onContinue={start}
        />
      )}
      {step === 'before' && photoStep('before')}
      {step === 'after' && photoStep('after')}
      {step === 'note' && <NoteStep busy={busy} error={error} onContinue={saveNote} />}
      {step === 'done' && (
        <div className="space-y-4">
          <p className="text-muted" data-testid="done-summary">
            {saved('before')} before and {saved('after')} after photos are saved for this job.
            Sending the link to your customer comes next.
          </p>
          <Button type="button" variant="secondary" size="lg" fullWidth onClick={startAnother}>
            Start another job
          </Button>
        </div>
      )}
    </section>
  );
}
