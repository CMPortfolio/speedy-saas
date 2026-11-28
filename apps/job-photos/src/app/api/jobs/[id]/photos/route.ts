import { buildObjectPath, extensionFor } from '@speedy/lib/photos';
import { NextResponse } from 'next/server';

import { MAX_PHOTOS_PER_KIND } from '@/config/constants';
import { remainingSlots, validateUpload } from '@/features/jobs/photo-limits';
import { jobIdSchema, photoUploadFieldsSchema, type PhotoSummary } from '@/features/jobs/schemas';
import { authorizeJob } from '@/features/jobs/server/authorize';
import { countPhotos, insertPhoto, type PhotoRow } from '@/features/jobs/server/repo';
import { handle, jsonError, notFound } from '@/lib/http';
import { getStorage } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

const UNIQUE_VIOLATION = '23505';

function summary(row: PhotoRow): PhotoSummary {
  return {
    id: row.id,
    kind: row.kind,
    position: row.position,
    width: row.width,
    height: row.height,
  };
}

/** Insert at the next free position; another upload may have taken it, so retry a couple of times. */
async function insertAtNextPosition(
  base: Omit<Parameters<typeof insertPhoto>[0], 'position'>,
  from: number,
): Promise<PhotoRow | null> {
  for (let position = from; position < MAX_PHOTOS_PER_KIND; position += 1) {
    try {
      return await insertPhoto({ ...base, position });
    } catch (e) {
      if ((e as { code?: string }).code !== UNIQUE_VIOLATION) throw e;
    }
  }
  return null;
}

/**
 * POST /api/jobs/[id]/photos: multipart with `file`, `kind` (before|after), `width`, `height`.
 * Up to MAX_PHOTOS_PER_KIND per kind, images only, under MAX_UPLOAD_BYTES. The browser has
 * already resized the photo; we store it under jobs/<job>/<kind>/<photo>.<ext>.
 */
export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  return handle('POST /api/jobs/[id]/photos', async () => {
    const id = jobIdSchema.safeParse((await params).id);
    if (!id.success) return notFound();
    const auth = await authorizeJob(id.data, request);
    if (!auth) return notFound();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError(400, 'bad_form', 'Send the photo as multipart form data.');
    }
    const fields = photoUploadFieldsSchema.safeParse({
      kind: form.get('kind'),
      width: form.get('width'),
      height: form.get('height'),
    });
    if (!fields.success) return jsonError(400, 'invalid', 'kind, width and height are required.');
    const file = form.get('file');
    if (!(file instanceof Blob)) return jsonError(400, 'no_file', 'Attach a photo as "file".');

    const existing = await countPhotos(id.data, fields.data.kind);
    const check = validateUpload({ type: file.type, size: file.size }, existing);
    if (!check.ok)
      return jsonError(
        check.error.code === 'too_many' ? 409 : 400,
        check.error.code,
        check.error.message,
      );
    const extension = extensionFor(file.type);
    if (!extension) return jsonError(400, 'not_an_image', 'Use a JPEG, PNG, WebP or HEIC photo.');

    const photoId = crypto.randomUUID();
    const storagePath = buildObjectPath(['jobs', id.data, fields.data.kind, photoId], extension);
    await getStorage().put(storagePath, await file.arrayBuffer(), file.type);
    const row = await insertAtNextPosition(
      {
        id: photoId,
        jobId: id.data,
        kind: fields.data.kind,
        storagePath,
        width: fields.data.width,
        height: fields.data.height,
      },
      existing,
    );
    if (!row) {
      await getStorage().remove([storagePath]);
      return jsonError(
        409,
        'too_many',
        `Up to ${MAX_PHOTOS_PER_KIND} photos each for before and after.`,
      );
    }
    return NextResponse.json(
      { photo: summary(row), remaining: remainingSlots(existing + 1) },
      { status: 201 },
    );
  });
}
