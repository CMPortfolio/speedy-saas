/** What the status buttons report back. Kept free of server code so the client bundle stays small. */
export type MarkState =
  { status: 'idle' } | { status: 'done' } | { status: 'error'; message: string };

export const idleMark: MarkState = { status: 'idle' };
