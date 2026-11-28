import { devSmsGuard } from '@/lib/dev-guard';

export const dynamic = 'force-dynamic';

/** Dev only, signed-in only: the texts the fake provider has "sent". */
export async function GET() {
  const guard = await devSmsGuard();
  if ('response' in guard) return guard.response;
  return Response.json({ sent: guard.provider.sent });
}
