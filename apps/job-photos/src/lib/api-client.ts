import { CLAIM_TOKEN_HEADER, type PhotoKind } from '@/config/constants';
import type {
  CreatedJob,
  CreateJobInput,
  PhotoSummary,
  UpdateJobInput,
} from '@/features/jobs/schemas';

/**
 * Browser-side calls to this tool's own API routes. Every request for an existing job carries
 * the claim token the device got when it created the job; signed-in owners are recognised by
 * their cookie and the token is simply ignored.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface JobHandle {
  id: string;
  claimToken: string;
}

async function readError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(
      response.status,
      body.error?.code ?? 'request_failed',
      body.error?.message ?? 'Something went wrong. Try again.',
    );
  } catch {
    return new ApiError(response.status, 'request_failed', 'Something went wrong. Try again.');
  }
}

async function send<T>(input: string, init: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

function authHeaders(job: JobHandle): HeadersInit {
  return { [CLAIM_TOKEN_HEADER]: job.claimToken };
}

export function createJobRequest(input: CreateJobInput): Promise<CreatedJob> {
  return send<CreatedJob>('/api/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateJobRequest(job: JobHandle, patch: UpdateJobInput): Promise<void> {
  return send<unknown>(`/api/jobs/${job.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...authHeaders(job) },
    body: JSON.stringify(patch),
  }).then(() => undefined);
}

export interface UploadedPhoto {
  photo: PhotoSummary;
  remaining: number;
}

export function uploadPhotoRequest(
  job: JobHandle,
  kind: PhotoKind,
  file: Blob,
  size: { width: number; height: number },
): Promise<UploadedPhoto> {
  const form = new FormData();
  form.set('kind', kind);
  form.set('width', String(size.width));
  form.set('height', String(size.height));
  form.set('file', file, `${kind}.jpg`);
  return send<UploadedPhoto>(`/api/jobs/${job.id}/photos`, {
    method: 'POST',
    headers: authHeaders(job),
    body: form,
  });
}

export function uploadLogoRequest(job: JobHandle, file: Blob): Promise<void> {
  const form = new FormData();
  form.set('file', file, 'logo');
  return send<unknown>(`/api/jobs/${job.id}/logo`, {
    method: 'POST',
    headers: authHeaders(job),
    body: form,
  }).then(() => undefined);
}
