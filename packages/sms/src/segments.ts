/**
 * How many text segments a message costs. Carriers bill and filter by segment: a message that fits
 * one segment is 160 GSM-7 characters or 70 UCS-2 characters, and once it splits each part holds
 * a little less (153 and 67) because of the part header.
 *
 * One curly quote or emoji anywhere moves the whole message from GSM-7 to UCS-2, which more than
 * halves what fits. That is the usual surprise, so the setup preview shows the count.
 */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/** Characters that exist in GSM-7 but cost two septets (an escape plus the character). */
const GSM_EXTENDED = '^{}\\[~]|€\f';

const BASIC = new Set(GSM_BASIC);
const EXTENDED = new Set(GSM_EXTENDED);

export type SmsEncoding = 'gsm7' | 'ucs2';

export interface SegmentCount {
  encoding: SmsEncoding;
  /** GSM-7: septets used (extended characters count 2). UCS-2: UTF-16 code units (an emoji is 2). */
  length: number;
  segments: number;
  /** Characters that forced UCS-2, for a plain warning. Empty for GSM-7. */
  nonGsm: string[];
}

const LIMITS = {
  gsm7: { single: 160, multi: 153 },
  ucs2: { single: 70, multi: 67 },
} as const;

export function countSegments(text: string): SegmentCount {
  let septets = 0;
  const nonGsm = new Set<string>();
  for (const ch of text) {
    if (BASIC.has(ch)) septets += 1;
    else if (EXTENDED.has(ch)) septets += 2;
    else nonGsm.add(ch);
  }

  const encoding: SmsEncoding = nonGsm.size > 0 ? 'ucs2' : 'gsm7';
  const length = encoding === 'gsm7' ? septets : text.length;
  const { single, multi } = LIMITS[encoding];
  let segments = 0;
  if (length > 0) segments = length <= single ? 1 : Math.ceil(length / multi);
  return { encoding, length, segments, nonGsm: [...nonGsm] };
}

/** More than this many segments gets a warning in the setup preview. */
export const MAX_COMFORTABLE_SEGMENTS = 2;
