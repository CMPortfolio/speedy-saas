/** The short error code (Postgres or provider) from a caught value, for logs. Never the message. */
export function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null
    ? (error as { code?: string }).code
    : undefined;
}
