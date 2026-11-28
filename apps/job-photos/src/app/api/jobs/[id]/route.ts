import { NextResponse } from 'next/server';

import { jobIdSchema, updateJobSchema } from '@/features/jobs/schemas';
import { authorizeJob } from '@/features/jobs/server/authorize';
import { updateJob } from '@/features/jobs/server/repo';
import { handle, notFound, parseJsonBody } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/jobs/[id]: change the title, note or business name. Owner or claim token. */
export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  return handle('PATCH /api/jobs/[id]', async () => {
    const id = jobIdSchema.safeParse((await params).id);
    if (!id.success) return notFound();
    const body = await parseJsonBody(request, updateJobSchema);
    if (!body.ok) return body.response;
    const auth = await authorizeJob(id.data, request);
    if (!auth) return notFound();
    const job = await updateJob(id.data, body.data);
    return NextResponse.json({
      id: job.id,
      title: job.title,
      note: job.note,
      business_name: job.business_name,
      review_url: job.review_url,
    });
  });
}
