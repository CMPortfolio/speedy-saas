/**
 * US phone helpers. Numbers are stored as E.164 (+12395550123) and shown as (239) 555-0123.
 * Rules follow the North American Numbering Plan: area code and exchange start with 2–9,
 * area codes never have 9 as the middle digit, and the exchange is never N11.
 */
export type E164 = `+1${string}`;

const DIGITS = /\D+/g;

export function digitsOnly(input: string): string {
  return input.replace(DIGITS, '');
}

/** Letters on a keypad (1-800-FLOWERS) to digits. */
function lettersToDigits(input: string): string {
  const map: Record<string, string> = {
    a: '2',
    b: '2',
    c: '2',
    d: '3',
    e: '3',
    f: '3',
    g: '4',
    h: '4',
    i: '4',
    j: '5',
    k: '5',
    l: '5',
    m: '6',
    n: '6',
    o: '6',
    p: '7',
    q: '7',
    r: '7',
    s: '7',
    t: '8',
    u: '8',
    v: '8',
    w: '9',
    x: '9',
    y: '9',
    z: '9',
  };
  return input.replace(/[a-z]/gi, (ch) => map[ch.toLowerCase()] ?? ch);
}

function tenDigits(input: string): string | null {
  const raw = digitsOnly(lettersToDigits(input.trim()));
  if (raw.length === 10) return raw;
  if (raw.length === 11 && raw.startsWith('1')) return raw.slice(1);
  return null;
}

function isValidTenDigits(d: string): boolean {
  if (d.length !== 10) return false;
  const area = d.slice(0, 3);
  const exchange = d.slice(3, 6);
  if (!/^[2-9]/.test(area) || area[1] === '9') return false;
  if (!/^[2-9]/.test(exchange) || exchange.slice(1) === '11') return false;
  // 555-01XX is reserved for fiction; allow it since it is handy in demos and docs.
  return true;
}

/** Normalise any US number spelling to E.164, or null when it isn't a valid US number. */
export function normalizeUsPhone(input: string): E164 | null {
  const d = tenDigits(input);
  if (!d || !isValidTenDigits(d)) return null;
  return `+1${d}`;
}

export function isValidUsPhone(input: string): boolean {
  return normalizeUsPhone(input) !== null;
}

/** (239) 555-0123 from any valid spelling; returns the input untouched when it isn't valid. */
export function formatUsPhone(input: string): string {
  const d = tenDigits(input);
  if (!d || !isValidTenDigits(d)) return input;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Last four digits for logs and lists: "•••• 0123". */
export function maskUsPhone(input: string): string {
  const d = tenDigits(input);
  return d ? `•••• ${d.slice(6)}` : '••••';
}

/** First name from a full name, for "Hi Maria" greetings. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}
