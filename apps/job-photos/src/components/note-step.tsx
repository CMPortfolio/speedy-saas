'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@speedy/ui/button';
import { Input } from '@speedy/ui/input';

export interface NoteStepProps {
  busy: boolean;
  error: string | null;
  onContinue: (note: string) => void;
}

/** Step 4: one line for the customer. Optional. */
export function NoteStep({ busy, error, onContinue }: NoteStepProps) {
  const [note, setNote] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onContinue(note.trim());
  };
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Input
        label="A note for the customer (optional)"
        hint="One line. E.g. “Replaced the capacitor and cleaned the coil.”"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        autoComplete="off"
        enterKeyHint="done"
      />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" fullWidth loading={busy} data-testid="note-next">
        {note ? 'Save the note' : 'Skip the note'}
      </Button>
    </form>
  );
}
