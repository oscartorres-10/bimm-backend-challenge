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

/** Log levels understood by the Pino logger, from most to least severe. */
export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

/** Databases we can store data in. */
export const DB_TYPES = ['sqlite', 'postgres'] as const;

/** Placeholder that must appear in the vehicle-types URL template. */
export const MAKE_ID_PLACEHOLDER = '{makeId}';

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .stringbool({
      truthy: ['true', '1', 'yes', 'on'],
      falsy: ['false', '0', 'no', 'off'],
    })
    .default(defaultValue);

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

    // ---- Logging -----------------------------------------------------------
    /** Minimum severity that gets written to the logs. */
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    /** Human-friendly coloured logs instead of JSON. Only for local development. */
    LOG_PRETTY: booleanFromEnv(false),

    // ---- External vPIC (NHTSA) API ----------------------------------------
    /** URL that returns every vehicle make as XML. */
    VPIC_ALL_MAKES_URL: z
      .url()
      .default(
        'https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=XML',
      ),
    /** URL template for the vehicle types of one make. `{makeId}` is replaced. */
    VPIC_VEHICLE_TYPES_URL_TEMPLATE: z
      .string()
      .default(
        `https://vpic.nhtsa.dot.gov/api/vehicles/GetVehicleTypesForMakeId/${MAKE_ID_PLACEHOLDER}?format=xml`,
      )
      .refine((value) => value.includes(MAKE_ID_PLACEHOLDER), {
        message: `must contain the ${MAKE_ID_PLACEHOLDER} placeholder`,
      })
      .refine(
        (value) => URL.canParse(value.replace(MAKE_ID_PLACEHOLDER, '1')),
        {
          message: 'must be a valid URL',
        },
      ),
    /** Give up on a single HTTP request after this many milliseconds. */
    HTTP_TIMEOUT_MS: intFromEnv(15_000, 100, 300_000),
    /** How many times to retry a failed HTTP request (0 = never retry). */
    HTTP_MAX_RETRIES: intFromEnv(3, 0, 10),
    /** Wait before the first retry; it doubles on every following retry. */
    HTTP_RETRY_BASE_DELAY_MS: intFromEnv(500, 0, 60_000),

    // ---- Ingestion ---------------------------------------------------------
    /**
     * How many vehicle-type requests may be in flight at the same time.
     * vPIC answers in roughly 0.5–1.5s, so 10 ≈ 10 makes per second
     * (~20 minutes for all ~12k makes) while staying polite to a public API.
     */
    INGESTION_CONCURRENCY: intFromEnv(10, 1, 50),
    /** How many makes are processed and saved together as one "batch". */
    INGESTION_BATCH_SIZE: intFromEnv(250, 1, 5_000),
    /** Only ingest the first N makes. 0 means "all of them" (~12k). */
    INGESTION_MAKE_LIMIT: intFromEnv(0, 0, 1_000_000),

    // ---- Feature flags -----------------------------------------------------
    /** Start an ingestion automatically when the service boots. */
    FEATURE_INGESTION_ON_STARTUP: booleanFromEnv(true),
    /** ...but skip that automatic run if the database already has data. */
    FEATURE_INGESTION_SKIP_IF_POPULATED: booleanFromEnv(true),
    /** Expose the `startIngestion` GraphQL mutation. */
    FEATURE_INGESTION_MUTATION: booleanFromEnv(true),

    // ---- GraphQL -----------------------------------------------------------
    /** Allow clients to ask the API for its own schema (used by tools). */
    GRAPHQL_INTROSPECTION: booleanFromEnv(true),
    /** Serve the Apollo Sandbox web UI when opening /graphql in a browser. */
    GRAPHQL_PLAYGROUND: booleanFromEnv(true),
    /** Largest page a client may request from list queries. */
    GRAPHQL_MAX_PAGE_SIZE: intFromEnv(1_000, 1, 20_000),

    // ---- Database ----------------------------------------------------------
    /** Which database engine to use. */
    DB_TYPE: z.enum(DB_TYPES).default('sqlite'),
    /** SQLite only: file path, or ":memory:" for a throw-away in-RAM database. */
    DB_SQLITE_PATH: z.string().min(1).default('data/vehicles.sqlite'),
    /** PostgreSQL only: connection details. */
    DB_HOST: z.string().min(1).default('localhost'),
    DB_PORT: intFromEnv(5432, 1, 65535),
    DB_USERNAME: z.string().min(1).default('postgres'),
    DB_PASSWORD: z.string().default('postgres'),
    DB_NAME: z.string().min(1).default('vehicles'),
    DB_SSL: booleanFromEnv(false),
    /** Print every SQL query to the logs (very noisy, debugging only). */
    DB_LOGGING: booleanFromEnv(false),
    /** Apply pending database migrations (schema changes) on startup. */
    DB_MIGRATIONS_RUN: booleanFromEnv(true),
  })
  .superRefine((env, ctx) => {
    // A cross-field rule: an in-memory SQLite database disappears when the
    // process stops, which would silently lose data in production.
    if (
      env.NODE_ENV === 'production' &&
      env.DB_TYPE === 'sqlite' &&
      env.DB_SQLITE_PATH === ':memory:'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['DB_SQLITE_PATH'],
        message: 'an in-memory SQLite database is not allowed in production',
      });
    }
  });

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
