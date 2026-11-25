'use client';

import { useId, useMemo } from 'react';
import type { ChangeEvent, ReactNode } from 'react';

import { Button } from './button';
import { cn } from './cn';
import { previewImport } from './csv';
import type { AcceptedRow, RowValidators, SkippedRow } from './csv';

export interface CsvImportProps<P, D> {
  /** The pasted or uploaded text. Controlled so a caller can add lines (phone contacts). */
  text: string;
  onTextChange: (text: string) => void;
  /** How a phone and a day are read. Rows that fail are shown as skipped with the reason. */
  validators: RowValidators<P, D>;
  /** Called with the rows the owner agreed to import. */
  onImport: (accepted: AcceptedRow<P, D>[]) => void | Promise<void>;
  formatPhone?: (phone: P) => string;
  formatDay?: (day: D) => string;
  importing?: boolean;
  /** Error from the last import attempt. */
  error?: ReactNode;
  /** Rendered under the paste box, e.g. a "Pick from phone contacts" button. */
  extraActions?: ReactNode;
  pasteLabel?: string;
  pasteHint?: string;
  fileLabel?: string;
  className?: string;
}

const fieldClass =
  'w-full rounded-brand border border-field bg-surface px-3 py-2 text-base text-ink ' +
  'placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function AcceptedTable<P, D>({
  rows,
  formatPhone,
  formatDay,
}: {
  rows: AcceptedRow<P, D>[];
  formatPhone: (phone: P) => string;
  formatDay: (day: D) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-brand border border-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Customers that will be imported</caption>
        <thead className="bg-background text-xs uppercase text-muted">
          <tr>
            <th scope="col" className="px-3 py-2">
              Name
            </th>
            <th scope="col" className="px-3 py-2">
              Phone
            </th>
            <th scope="col" className="px-3 py-2">
              Day
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.line} className="border-t border-border">
              <td className="px-3 py-2">
                <div className="font-medium text-ink">{row.name}</div>
                {row.note && <div className="text-xs text-muted">{row.note}</div>}
              </td>
              <td className="whitespace-nowrap px-3 py-2">{formatPhone(row.phone)}</td>
              <td className="whitespace-nowrap px-3 py-2">{formatDay(row.day)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkippedTable({ rows }: { rows: SkippedRow[] }) {
  return (
    <div className="overflow-x-auto rounded-brand border border-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Lines that will be skipped</caption>
        <thead className="bg-background text-xs uppercase text-muted">
          <tr>
            <th scope="col" className="px-3 py-2">
              Line
            </th>
            <th scope="col" className="px-3 py-2">
              What was there
            </th>
            <th scope="col" className="px-3 py-2">
              Why
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.line} className="border-t border-border">
              <td className="px-3 py-2 text-muted">{row.line}</td>
              <td className="px-3 py-2 text-ink">{row.raw.join(', ')}</td>
              <td className="whitespace-nowrap px-3 py-2 text-danger">{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Paste a list or choose a CSV file, see which lines will be imported and which will be
 * skipped (with the reason), then one Import button. Generic: pass the phone and day rules.
 */
export function CsvImport<P, D>({
  text,
  onTextChange,
  validators,
  onImport,
  formatPhone = String,
  formatDay = String,
  importing = false,
  error,
  extraActions,
  pasteLabel = 'Paste a list',
  pasteHint = 'One customer per line: Name, phone, day, note. The note is optional. Commas, tabs or semicolons all work.',
  fileLabel = 'Or choose a CSV file',
  className,
}: CsvImportProps<P, D>) {
  const id = useId();
  const preview = useMemo(() => previewImport(text, validators), [text, validators]);
  const hasText = text.trim() !== '';

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    onTextChange(await file.text());
    event.target.value = '';
  }

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-paste`} className="text-sm font-medium text-ink">
          {pasteLabel}
        </label>
        <textarea
          id={`${id}-paste`}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={6}
          aria-describedby={`${id}-paste-hint`}
          placeholder={
            'Maria Lopez, 239-555-0123, Tuesday, back gate\nJim Hale, (239) 555-0188, Wed'
          }
          className={cn(fieldClass, 'min-h-tap font-mono text-sm')}
        />
        <p id={`${id}-paste-hint`} className="text-sm text-muted">
          {pasteHint}
        </p>
      </div>
      {extraActions}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-file`} className="text-sm font-medium text-ink">
          {fileLabel}
        </label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
          onChange={handleFile}
          className={cn(
            fieldClass,
            'min-h-tap file:mr-3 file:min-h-tap file:rounded-brand file:border-0 file:bg-background file:px-3 file:font-medium file:text-ink',
          )}
        />
        <p className="text-sm text-muted">
          A header row is fine. Columns are picked up by name: name, phone, day, note.
        </p>
      </div>

      {hasText && (
        <section aria-live="polite" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-ink">
              Will be imported: {plural(preview.accepted.length, 'customer')}
            </h2>
            {preview.accepted.length > 0 ? (
              <AcceptedTable
                rows={preview.accepted}
                formatPhone={formatPhone}
                formatDay={formatDay}
              />
            ) : (
              <p className="text-sm text-muted">
                Nothing can be imported yet. Check the lines below.
              </p>
            )}
          </div>
          {preview.skipped.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-ink">
                Will be skipped: {plural(preview.skipped.length, 'line')}
              </h2>
              <SkippedTable rows={preview.skipped} />
              <p className="text-sm text-muted">Fix a line in the box above and it moves up.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="button"
            fullWidth
            size="lg"
            loading={importing}
            disabled={preview.accepted.length === 0}
            onClick={() => void onImport(preview.accepted)}
          >
            Import {plural(preview.accepted.length, 'customer')}
          </Button>
        </section>
      )}
    </div>
  );
}
