import { z } from 'zod';

/**
 * Parse process.env against a Zod schema and fail fast with a readable message.
 *
 *   export const env = createEnv({
 *     server: { SUPABASE_SERVICE_ROLE_KEY: z.string().min(1) },
 *     client: { NEXT_PUBLIC_SUPABASE_URL: z.url() },
 *   });
 *
 * Client keys must start with NEXT_PUBLIC_ so Next.js inlines them. Server keys are stripped
 * from the result when running in the browser, so a client component can never read them.
 */
type Shape = Record<string, z.ZodType>;

export interface CreateEnvOptions<S extends Shape, C extends Shape> {
  server?: S;
  client?: C;
  /** Defaults to process.env. Pass an object in tests. */
  runtimeEnv?: Record<string, string | undefined>;
  /** Skip validation (for example during `next build` in CI without secrets). Default false. */
  skipValidation?: boolean;
}

export type Env<S extends Shape, C extends Shape> = z.infer<z.ZodObject<S>> &
  z.infer<z.ZodObject<C>>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment variables:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function createEnv<S extends Shape, C extends Shape>(
  options: CreateEnvOptions<S, C>,
): Env<S, C> {
  const server = options.server ?? ({} as S);
  const client = options.client ?? ({} as C);
  const runtimeEnv = options.runtimeEnv ?? process.env;

  for (const key of Object.keys(client)) {
    if (!key.startsWith('NEXT_PUBLIC_')) {
      throw new EnvError([`client key "${key}" must start with NEXT_PUBLIC_`]);
    }
  }

  const shape = isBrowser() ? client : { ...server, ...client };
  const schema = z.object(shape);

  if (options.skipValidation) {
    return runtimeEnv as unknown as Env<S, C>;
  }

  const parsed = schema.safeParse(runtimeEnv);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new EnvError(issues);
  }

  return new Proxy(parsed.data as Env<S, C>, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (isBrowser() && prop in server && !(prop in client)) {
        throw new EnvError([`"${prop}" is a server-only variable and was read in the browser`]);
      }
      return Reflect.get(target, prop);
    },
  });
}

/** Common helpers so every tool spells these the same way. */
export const envHelpers = {
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  url: z.url(),
  nonEmpty: z.string().min(1),
  /** Comma-separated list, trimmed, empty entries dropped. */
  list: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  bool: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  port: z.coerce.number().int().min(1).max(65535),
};
