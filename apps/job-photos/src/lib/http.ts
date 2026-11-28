import 'server-only';

import { logger } from '@speedy/lib/logger';
import { NextResponse } from 'next/server';
import type { z } from 'zod';

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** A JSON error the browser can show as-is. `message` is plain and safe for an owner to read. */
export function jsonError(
  status: number,
  code: string,
  message: string,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const notFound = () => jsonError(404, 'not_found', 'We could not find that job.');

/** Parse a JSON body against a schema; a bad body answers 400 with the first issue. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse<ApiErrorBody> }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, 'bad_json', 'Send JSON.') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') || 'body';
    return {
      ok: false,
      response: jsonError(400, 'invalid', `${where}: ${issue?.message ?? 'invalid'}`),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Run a route body; anything thrown becomes a logged 500 with a plain message. */
export async function handle(
  route: string,
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    logger.error('route failed', { route, error: e });
    return jsonError(500, 'server_error', 'Something went wrong on our side. Try again.');
  }
}
