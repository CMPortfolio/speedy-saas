'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@speedy/ui/button';
import { Modal } from '@speedy/ui/modal';

import { clearPracticePhone } from './actions';

/** Wipes the practice phone. Real customers, rain days and replies are not touched. */
export function ClearPracticeButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clear() {
    setError(null);
    start(async () => {
      const result = await clearPracticePhone();
      if (result.ok) {
        setOpen(false);
        router.push('/rain-day');
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Clear practice
      </Button>
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Clear practice?"
        description="This removes the practice texts and replies. Your customers and your real rain days are not touched."
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
              Keep
            </Button>
            <Button variant="danger" loading={pending} onClick={clear}>
              Clear it
            </Button>
          </>
        }
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
