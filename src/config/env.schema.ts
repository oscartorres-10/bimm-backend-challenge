/**
 * Environment variable schema (the "contract" for configuration).
 *
 * What is this?
 *   Our service is configured with environment variables: plain text
 *   key/value pairs given to the process by the shell, Docker, or a `.env`
 *   file (for example `PORT=3000`). Because they are always text, they can be
 *   misspelled, missing, or have the wrong format.
 *
 *   This file describes, with the Zod validation library, EVERY variable the
 *   service understands: its type, its allowed values, and its default.
 *   On startup we run the real environment through this schema. If anything
 *   is wrong, the service refuses to start and prints a clear message,
 *   instead of crashing later in a confusing way.
 *
 */
import { z } from 'zod';

/** The three environments the service knows how to run in. */
export const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
;

/**
 * Turns text such as "3000" into a whole number and checks its range.
 * `z.coerce.number()` converts the string to a number before validating it.
 */
const intFromEnv = (defaultValue: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(defaultValue);

/** The full schema. Each key is one environment variable. */
export const envSchema = z
  .object({
    // ---- General -----------------------------------------------------------
    /** Which environment we are running in. Changes some defaults. */
    NODE_ENV: z.enum(NODE_ENVIRONMENTS).default('development'),
    /** TCP port the HTTP server listens on. */
    PORT: intFromEnv(3000, 1, 65535),
    /** Network interface to listen on. 0.0.0.0 = every interface (needed in Docker). */
    HOST: z.string().min(1).default('0.0.0.0'),
  })

/** The TypeScript type of a validated configuration object. */
export type Env = z.infer<typeof envSchema>;

/**
 * Thrown when the environment does not satisfy the schema.
 * The message lists every problem at once so they can all be fixed together.
 */
export class InvalidConfigurationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'InvalidConfigurationError';
  }
}

/**
 * Validates raw environment variables and returns a typed, defaulted object.
 *
 * Nest's ConfigModule calls this once on startup (see `app-config.module.ts`).
 * Empty strings are treated as "not set" so that `PORT=` falls back to the
 * default instead of failing.
 *
 * @param raw - usually `process.env` merged with values from `.env` files.
 * @throws InvalidConfigurationError when any variable is invalid.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== ''),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new InvalidConfigurationError(
      result.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    );
  }
  return result.data;
}
