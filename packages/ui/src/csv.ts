/**
 * Pure parsing for pasted or uploaded customer lists. No React, no tool-specific rules: the
 * caller supplies how a phone and a day are validated, this module handles the text.
 *
 *   const rows = parseDelimited(text);              // comma, tab or semicolon; quotes honoured
 *   const header = detectColumns(rows[0]);          // null when the first row is data
 *   const { accepted, skipped } = mapRows(rows, header ?? DEFAULT_MAPPING, validators);
 *
 * `previewImport(text, validators)` does the three steps in one call.
 */
export type Row = string[];

export type ColumnKey = 'name' | 'phone' | 'day' | 'note';

/** Which column index holds each field. `note` is optional. */
export type ColumnMapping = Partial<Record<ColumnKey, number>> & { name: number; phone: number };

/** `Name, phone, day[, note]`: the order owners type when there is no header row. */
export const DEFAULT_MAPPING: ColumnMapping = { name: 0, phone: 1, day: 2, note: 3 };

export type SkipReason =
  | 'No name'
  | 'Bad phone number'
  | 'Same number appears above'
  | 'Already in your list'
  | 'No service day'
  | 'Unknown day';

export interface RowValidators<P, D> {
  /** Normalised phone (what will be stored) or null when it is not a valid number. */
  phone: (raw: string) => P | null;
  /** Parsed day or null when it cannot be read. */
  day: (raw: string) => D | null;
  /** Normalised phones already in the owner's list; rows with these are skipped. */
  existingPhones?: ReadonlySet<P>;
}

export interface AcceptedRow<P, D> {
  /** 1-based line number in the pasted text or file, for the preview. */
  line: number;
  name: string;
  phone: P;
  day: D;
  note: string | null;
}

export interface SkippedRow {
  line: number;
  raw: Row;
  reason: SkipReason;
}

export interface MappedRows<P, D> {
  accepted: AcceptedRow<P, D>[];
  skipped: SkippedRow[];
}

const DELIMITERS = [',', '\t', ';'] as const;
type Delimiter = (typeof DELIMITERS)[number];

/** The delimiter that splits the most lines, so a note with one comma does not win over tabs. */
export function detectDelimiter(text: string): Delimiter {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  let best: Delimiter = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const score = lines.filter((l) => l.includes(d)).length;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function splitLine(line: string, delimiter: Delimiter): Row {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

/** Split text into trimmed cells. Blank lines are dropped; a BOM is ignored. */
export function parseDelimited(text: string): Row[] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = detectDelimiter(clean);
  return clean
    .split(/\r?\n/)
    .map((line) => splitLine(line, delimiter))
    .filter((row) => row.some((cell) => cell !== ''));
}

const HEADER_ALIASES: Record<ColumnKey, readonly string[]> = {
  name: ['name', 'customer', 'customername', 'client', 'fullname', 'contact'],
  phone: ['phone', 'mobile', 'cell', 'cellphone', 'phonenumber', 'number', 'tel', 'telephone'],
  day: ['day', 'serviceday', 'usualday', 'weekday', 'visitday', 'route'],
  note: ['note', 'notes', 'comment', 'comments', 'address', 'gate'],
};

function normaliseHeader(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Read a header row. Returns the mapping when the row names at least a name and a phone
 * column; null when it looks like data (so the first row should be imported, not skipped).
 */
export function detectColumns(headers: Row): ColumnMapping | null {
  const found: Partial<Record<ColumnKey, number>> = {};
  headers.forEach((cell, index) => {
    const key = normaliseHeader(cell);
    for (const column of Object.keys(HEADER_ALIASES) as ColumnKey[]) {
      if (found[column] === undefined && HEADER_ALIASES[column].includes(key))
        found[column] = index;
    }
  });
  if (found.name === undefined || found.phone === undefined) return null;
  return { ...found, name: found.name, phone: found.phone };
}

function cell(row: Row, index: number | undefined): string {
  return index === undefined ? '' : (row[index] ?? '');
}

function mapOne<P, D>(
  row: Row,
  mapping: ColumnMapping,
  validators: RowValidators<P, D>,
  seen: Set<P>,
): { ok: true; value: Omit<AcceptedRow<P, D>, 'line'> } | { ok: false; reason: SkipReason } {
  const name = cell(row, mapping.name);
  if (name === '') return { ok: false, reason: 'No name' };
  const phone = validators.phone(cell(row, mapping.phone));
  if (phone === null) return { ok: false, reason: 'Bad phone number' };
  if (seen.has(phone)) return { ok: false, reason: 'Same number appears above' };
  if (validators.existingPhones?.has(phone)) return { ok: false, reason: 'Already in your list' };
  const rawDay = cell(row, mapping.day);
  if (rawDay === '') return { ok: false, reason: 'No service day' };
  const day = validators.day(rawDay);
  if (day === null) return { ok: false, reason: 'Unknown day' };
  const note = cell(row, mapping.note);
  return { ok: true, value: { name, phone, day, note: note === '' ? null : note } };
}

/**
 * Turn parsed rows into customers to import plus the rows to skip, each with a plain reason.
 * `firstLine` is the 1-based line number of `rows[0]` (2 when a header row was removed).
 */
export function mapRows<P, D>(
  rows: readonly Row[],
  mapping: ColumnMapping,
  validators: RowValidators<P, D>,
  firstLine = 1,
): MappedRows<P, D> {
  const accepted: AcceptedRow<P, D>[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<P>();
  rows.forEach((row, i) => {
    const line = firstLine + i;
    const result = mapOne(row, mapping, validators, seen);
    if (result.ok) {
      seen.add(result.value.phone);
      accepted.push({ line, ...result.value });
    } else {
      skipped.push({ line, raw: row, reason: result.reason });
    }
  });
  return { accepted, skipped };
}

/** Parse, detect a header row if there is one, and map. The whole import in one call. */
export function previewImport<P, D>(
  text: string,
  validators: RowValidators<P, D>,
): MappedRows<P, D> & { hasHeader: boolean } {
  const rows = parseDelimited(text);
  const header = rows[0] ? detectColumns(rows[0]) : null;
  if (header) return { hasHeader: true, ...mapRows(rows.slice(1), header, validators, 2) };
  return { hasHeader: false, ...mapRows(rows, DEFAULT_MAPPING, validators, 1) };
}
