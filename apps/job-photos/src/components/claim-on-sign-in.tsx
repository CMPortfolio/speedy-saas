'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { forgetClaims, listClaims } from '@speedy/lib/device-claims';

import { CLAIM_NAMESPACE } from '@/config/constants';
import { readDeviceBusiness } from '@/hooks/use-device-business';
import { claimJobsRequest } from '@/lib/api-client';

type State =
  { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; count: number } | { kind: 'failed' };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Runs once on /jobs after sign-in: sends the claim tokens this phone kept, forgets the ones
 * the server accepted and refreshes the list. Quiet when there is nothing to claim.
 */
export function ClaimOnSignIn() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const claims = listClaims(CLAIM_NAMESPACE, storage());
    const business = readDeviceBusiness(storage());
    if (claims.length === 0 && !business.name && !business.logoDataUrl) return;
    const run = async () => {
      setState({ kind: 'saving' });
      try {
        const { claimed } = await claimJobsRequest({
          claims: claims.map((c) => ({ id: c.id, token: c.token })),
          business: { name: business.name || null, logoDataUrl: business.logoDataUrl },
        });
        forgetClaims(CLAIM_NAMESPACE, claimed, storage());
        setState({ kind: 'saved', count: claimed.length });
        if (claimed.length > 0) router.refresh();
      } catch {
        setState({ kind: 'failed' });
      }
    };
    void run();
  }, [router]);

  if (state.kind === 'idle') return null;
  return (
    <p
      role="status"
      className="rounded-brand border border-border bg-surface px-4 py-3 text-sm text-muted"
    >
      {state.kind === 'saving' && 'Saving the jobs from this phone…'}
      {state.kind === 'saved' &&
        (state.count === 0
          ? 'Nothing new to save from this phone.'
          : `${state.count} ${state.count === 1 ? 'job' : 'jobs'} from this phone saved to your account.`)}
      {state.kind === 'failed' &&
        'We could not save the jobs from this phone just now. They stay on the phone; try again later.'}
    </p>
  );
}
