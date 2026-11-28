import { buildObjectPath, extensionFor } from '@speedy/lib/photos';
import { NextResponse } from 'next/server';

import { MAX_UPLOAD_BYTES } from '@/config/constants';
import { jobIdSchema } from '@/features/jobs/schemas';
import { authorizeJob } from '@/features/jobs/server/authorize';
import { setJobLogo } from '@/features/jobs/server/repo';
import { handle, jsonError, notFound } from '@/lib/http';
import { getStorage } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

/** Logos are small; a few hundred KB is plenty after the browser has shrunk it. */
const MAX_LOGO_BYTES = Math.min(MAX_UPLOAD_BYTES, 1024 * 1024);

/**
 * POST /api/jobs/[id]/logo: multipart with `file`. Stores the business logo for this job so
 * the share page can show it. Owner or claim token.
 */
export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  return handle('POST /api/jobs/[id]/logo', async () => {
    const id = jobIdSchema.safeParse((await params).id);
    if (!id.success) return notFound();
    const auth = await authorizeJob(id.data, request);
    if (!auth) return notFound();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError(400, 'bad_form', 'Send the logo as multipart form data.');
    }
    const file = form.get('file');
    if (!(file instanceof Blob)) return jsonError(400, 'no_file', 'Attach the logo as "file".');
    const extension = extensionFor(file.type);
    if (!extension) return jsonError(400, 'not_an_image', 'Use a JPEG, PNG or WebP logo.');
    if (file.size === 0 || file.size > MAX_LOGO_BYTES) {
      return jsonError(400, 'too_large', 'Logos must be under 1MB.');
    }

    const storagePath = buildObjectPath(['jobs', id.data, 'logo'], extension);
    await getStorage().put(storagePath, await file.arrayBuffer(), file.type);
    await setJobLogo(id.data, storagePath);
    return NextResponse.json({ logo_path: storagePath });
  });
}
