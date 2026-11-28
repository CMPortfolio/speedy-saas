import type { Database } from '@speedy/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { runMarkCall } from './mark-action';

const ID = '11111111-1111-4111-8111-111111111111';
const form = (data: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
};
const client = (error: { message: string } | null) => {
  const rpc = vi.fn(async () => ({ error }));
  return {
    rpc,
    c: { schema: () => ({ rpc }) } as unknown as SupabaseClient<Database>,
  };
};

describe('runMarkCall', () => {
  it('marks the call and reports done', async () => {
    const { c, rpc } = client(null);
    expect(await runMarkCall(c, form({ callId: ID, status: 'junk' }))).toEqual({ status: 'done' });
    expect(rpc).toHaveBeenCalledWith('mark_call', { p_call_id: ID, p_status: 'junk' });
  });

  it('turns a database failure into a plain message, without the raw error', async () => {
    const { c } = client({ message: 'permission denied for table calls' });
    const state = await runMarkCall(c, form({ callId: ID, status: 'booked' }));
    expect(state.status).toBe('error');
    expect(JSON.stringify(state)).not.toContain('permission');
  });

  it.each([
    { callId: 'nope', status: 'junk' },
    { callId: ID, status: 'replied' },
    { callId: ID, status: 'missed' },
    {},
  ])('rejects bad input %j without touching the database', async (data) => {
    const { c, rpc } = client(null);
    const state = await runMarkCall(c, form(data as Record<string, string>));
    expect(state.status).toBe('error');
    expect(rpc).not.toHaveBeenCalled();
  });
});
