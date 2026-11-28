/**
 * Small structured logger. One JSON line per event in production, readable lines in dev.
 * Never pass secrets in; common secret-looking keys are redacted as a backstop.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEY =
  /(secret|token|password|passwd|api[-_]?key|authorization|cookie|service[-_]?role)/i;

export function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY.test(key)) {
      out[key] = '[redacted]';
    } else if (value instanceof Error) {
      out[key] = { name: value.name, message: value.message, stack: value.stack };
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redact(value as LogFields);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface LoggerOptions {
  /** Minimum level to emit. Defaults to LOG_LEVEL, then "info" in production and "debug" elsewhere. */
  level?: LogLevel;
  /** Pretty print instead of JSON. Defaults to true outside production. */
  pretty?: boolean;
  /** Where lines go. Defaults to process.stdout/stderr through console. */
  write?: (level: LogLevel, line: string) => void;
}

function env(name: string): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env[name];
}

function defaultWrite(level: LogLevel, line: string): void {
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export function createLogger(base: LogFields = {}, options: LoggerOptions = {}): Logger {
  const isProd = env('NODE_ENV') === 'production';
  const level =
    options.level ?? ((env('LOG_LEVEL') as LogLevel | undefined) || (isProd ? 'info' : 'debug'));
  const pretty = options.pretty ?? !isProd;
  const write = options.write ?? defaultWrite;
  const threshold = LEVEL_ORDER[level] ?? LEVEL_ORDER.info;

  const emit = (lvl: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_ORDER[lvl] < threshold) return;
    const payload = redact({ ...base, ...(fields ?? {}) });
    const time = new Date().toISOString();
    if (pretty) {
      const extra = Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : '';
      write(lvl, `${time} ${lvl.toUpperCase().padEnd(5)} ${message}${extra}`);
    } else {
      write(lvl, JSON.stringify({ time, level: lvl, message, ...payload }));
    }
  };

  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (fields) => createLogger({ ...base, ...fields }, options),
  };
}

export const logger: Logger = createLogger();
