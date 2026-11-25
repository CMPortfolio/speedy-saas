/**
 * Practice mode only ever uses fictional numbers: (239) 555-0100 to 0199 are reserved for fiction.
 * The practice line (the number the practice texts come "from") is 0100; callers are 0101 to 0199.
 */
export const PRACTICE_LINE_NUMBER = '+12395550100' as const;

const CALLER = /^\+12395550(1[0-9]{2})$/;

/** True for a practice caller: +1239555 0101 to 0199 and nothing else. */
export function isPracticeCaller(value: string): value is `+1${string}` {
  const match = CALLER.exec(value);
  return match !== null && match[1] !== '100';
}

/** The next unused practice caller, or a recycled one when all 99 are in use. */
export function nextPracticeCaller(
  used: readonly string[],
  random: () => number = Math.random,
): `+1${string}` {
  const taken = new Set(used);
  for (let n = 101; n <= 199; n += 1) {
    const candidate = `+12395550${n}` as `+1${string}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `+12395550${101 + Math.floor(random() * 99)}` as `+1${string}`;
}
