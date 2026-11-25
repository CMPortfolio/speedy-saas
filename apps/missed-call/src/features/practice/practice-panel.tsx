'use client';

import { useState, useTransition } from 'react';

import { formatUsPhone } from '@speedy/lib/phone';
import { Button } from '@speedy/ui/button';

import {
  practiceCall,
  practiceClear,
  practiceMark,
  practiceReply,
  type PracticeActionResult,
} from './practice-actions';
import { Phone } from './phone';
import type { PracticeView } from './practice-state';

const STATUS_LABEL: Record<string, string> = {
  missed: 'Missed',
  texted: 'Texted back',
  replied: 'Replied',
  called_back: 'Called back',
  booked: 'Booked',
  junk: 'Junk',
};

const MARKS = [
  { status: 'called_back', label: 'Called back' },
  { status: 'booked', label: 'Booked' },
  { status: 'junk', label: 'Junk' },
] as const;

/** The call whose thread is on the caller phone (the one tapped, else the newest) and the texts for both phones. */
function pickCall(view: PracticeView, selected: string | null) {
  const current = view.calls.find((c) => c.id === selected) ?? view.calls[0] ?? null;
  return {
    current,
    forThisCall: view.messages.filter((m) => m.callId === current?.id),
    toYourCell: view.messages.filter((m) => m.direction === 'forward'),
  };
}

function ResultNote({ result }: { result: PracticeActionResult | null }) {
  if (!result) return null;
  return (
    <p
      role={result.ok ? 'status' : 'alert'}
      data-testid="practice-note"
      className={result.ok ? 'text-ink' : 'text-sm font-medium text-danger'}
    >
      {result.ok ? result.note : result.message}
    </p>
  );
}

type Run = (action: () => Promise<PracticeActionResult>) => void;

function CallRows({
  calls,
  currentId,
  pending,
  onSelect,
  run,
}: {
  calls: PracticeView['calls'];
  currentId: string | null;
  pending: boolean;
  onSelect: (id: string) => void;
  run: Run;
}) {
  if (calls.length === 0) return null;
  return (
    <ul className="space-y-2" data-testid="practice-calls">
      {calls.map((call) => (
        <li
          key={call.id}
          data-testid="practice-call-row"
          data-status={call.status}
          className="space-y-2 rounded-brand border border-border bg-surface p-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <button
              type="button"
              onClick={() => onSelect(call.id)}
              aria-pressed={currentId === call.id}
              className="min-h-tap text-left text-base font-semibold underline-offset-2 hover:underline"
            >
              {formatUsPhone(call.callerNumber)}
            </button>
            <span data-testid="practice-status" className="text-sm font-medium text-muted">
              {STATUS_LABEL[call.status]}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {MARKS.map(({ status, label }) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || call.status === status}
                aria-label={`${label}: ${formatUsPhone(call.callerNumber)} (practice)`}
                onClick={() => run(() => practiceMark(call.id, status))}
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => practiceCall(call.callerNumber))}
            >
              Calls again
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReplyForm({ callId, pending, run }: { callId: string; pending: boolean; run: Run }) {
  const [reply, setReply] = useState('');
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const body = reply;
        setReply('');
        run(() => practiceReply(callId, body));
      }}
    >
      <label htmlFor="practice-reply" className="text-sm font-medium text-ink">
        Reply as the caller
      </label>
      <input
        id="practice-reply"
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        maxLength={320}
        autoComplete="off"
        placeholder="leaking water heater, garage"
        className="min-h-tap w-full rounded-brand border border-border bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
      <p className="text-xs text-muted">Try STOP, START or HELP too.</p>
      <Button type="submit" size="sm" loading={pending} data-testid="practice-send-reply">
        Send reply
      </Button>
    </form>
  );
}

/**
 * The practice phone for an owner whose real number is not set up yet. Everything the tool would
 * text shows here instead, and nothing is sent to anyone.
 */
export function PracticePanel({ view, ownerCell }: { view: PracticeView; ownerCell: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PracticeActionResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const run: Run = (action) => start(async () => setResult(await action()));

  const { current, forThisCall, toYourCell } = pickCall(view, selected);

  return (
    <section className="space-y-4" aria-labelledby="practice-title" data-testid="practice-panel">
      <div className="space-y-1 rounded-brand border border-border bg-surface p-4">
        <h2 id="practice-title" className="text-lg font-semibold">
          Practice mode
        </h2>
        <p className="text-muted" data-testid="practice-banner">
          Practice mode — nothing is texted to anyone. Your real number isn&apos;t set up yet. Play
          the customer below to see what a missed call does.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => run(() => practiceCall())}
          loading={pending}
          data-testid="practice-call"
        >
          Simulate a missed call
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => run(() => practiceClear())}
          disabled={pending || view.calls.length === 0}
          data-testid="practice-clear"
        >
          Clear practice
        </Button>
      </div>

      <ResultNote result={result} />

      <CallRows
        calls={view.calls}
        currentId={current?.id ?? null}
        pending={pending}
        onSelect={setSelected}
        run={run}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <Phone
            title={
              current ? `Caller's phone: ${formatUsPhone(current.callerNumber)}` : "Caller's phone"
            }
            received={['out']}
            messages={forThisCall}
            empty="Simulate a missed call to see the text the caller gets."
            testId="practice-caller-phone"
          />
          {current && <ReplyForm callId={current.id} pending={pending} run={run} />}
        </div>
        <Phone
          title={`Your cell: ${formatUsPhone(ownerCell)}`}
          received={['forward']}
          messages={toYourCell}
          empty="A caller's reply shows up here as a new lead."
          testId="practice-cell-phone"
        />
      </div>
    </section>
  );
}
