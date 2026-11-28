import type { Metadata } from 'next';

import { NewJobFlow } from '@/components/new-job-flow';

export const metadata: Metadata = { title: 'New job', robots: { index: false } };

/** The one moment: the tech is still in the driveway. Everything here works without sign-in. */
export default function NewJobPage() {
  return (
    <div className="py-2">
      <NewJobFlow />
    </div>
  );
}
