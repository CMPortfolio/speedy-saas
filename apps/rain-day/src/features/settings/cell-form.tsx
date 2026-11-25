'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { formatUsPhone } from '@speedy/lib/phone';
import { Button } from '@speedy/ui/button';
import { Input } from '@speedy/ui/input';

import { confirmCellCode, removeCell, sendCellCode, type CellResult } from './cell-actions';

export interface CellFormProps {
  verifiedCell: string | null;
  /** True when a code was already texted and has not expired, so the code box shows at once. */
  codePending: boolean;
  suggestedPhone: string;
}

/** Reply forwarding: type a cell, get a code by text, type it back. Nothing forwards until then. */
export function CellForm({ verifiedCell, codePending, suggestedPhone }: CellFormProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState(suggestedPhone ? formatUsPhone(suggestedPhone) : '');
  const [code, setCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(codePending);
  const [note, setNote] = useState<CellResult | null>(null);
  const [changing, setChanging] = useState(false);

  function run(action: () => Promise<CellResult>, after?: (r: CellResult) => void) {
    setNote(null);
    start(async () => {
      const result = await action();
      setNote(result);
      after?.(result);
      router.refresh();
    });
  }

  if (verifiedCell && !awaitingCode && !changing) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-base text-ink">
          Replies are texted to <strong>{formatUsPhone(verifiedCell)}</strong>.
        </p>
        <Button variant="secondary" loading={pending} onClick={() => run(removeCell)}>
          Stop forwarding replies
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setPhone('');
            setChanging(true);
          }}
        >
          Use a different number
        </Button>
        {note && !note.ok && (
          <p role="alert" className="text-sm text-danger">
            {note.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Text my replies to"
        name="owner_cell"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="(239) 555-0123"
        hint="We text a 6-digit code to this number first. Until you enter it, replies stay in the list and are not forwarded."
      />
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          run(
            () => sendCellCode(phone),
            (r) => r.ok && setAwaitingCode(true),
          )
        }
      >
        Text me a code
      </Button>
      {awaitingCode && (
        <>
          <Input
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button
            loading={pending}
            onClick={() =>
              run(
                () => confirmCellCode(code),
                (r) => r.ok && setAwaitingCode(false),
              )
            }
          >
            Turn on forwarding
          </Button>
        </>
      )}
      {note && (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'text-sm text-success' : 'text-sm text-danger'}
        >
          {note.message}
        </p>
      )}
    </div>
  );
}
