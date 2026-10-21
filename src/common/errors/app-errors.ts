/**
 * The service's own error types.
 *
 * Why custom errors?
 *   JavaScript's built-in `Error` only carries a message. When something
 *   fails during ingestion we want to know WHAT KIND of failure it was
 *   (network? bad XML? database?) so we can decide whether to retry, how to
 *   log it, and what to tell the client. Each class below represents one
 *   kind of failure. Each has a stable `code` string that ends up in logs
 *   and can be searched for (e.g. `"code":"XML_PARSE_ERROR"`).
 *
 *   `cause` (a standard Error option) keeps the original low-level error so
 *   the full story is preserved in the logs.
 */

/** Machine-readable identifiers for every failure category. */
export type AppErrorCode =
  | 'EXTERNAL_API_ERROR'
  | 'XML_PARSE_ERROR'
  | 'TRANSFORMATION_ERROR'
  | 'PERSISTENCE_ERROR'
  | 'INGESTION_ALREADY_RUNNING'
  | 'INVALID_INPUT';

/** Parent class for all errors we create on purpose. */
export abstract class AppError extends Error {
  abstract readonly code: AppErrorCode;

  /** Extra structured facts (URLs, ids, ...) that are useful in logs. */
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    options: { cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.details = options.details ?? {};
  }
}

/**
 * The remote vPIC API could not be reached, timed out, or answered with an
 * error status (e.g. 503).
 *
 * `retryable` tells the retry helper whether trying again makes sense:
 * a timeout or a 503 might succeed next time; a 404 never will.
 */
export class ExternalApiError extends AppError {
  readonly code = 'EXTERNAL_API_ERROR' as const;

  constructor(
    message: string,
    readonly retryable: boolean,
    options: {
      cause?: unknown;
      url: string;
      status?: number;
      attempts?: number;
    },
  ) {
    super(message, {
      cause: options.cause,
      details: {
        url: options.url,
        status: options.status,
        attempts: options.attempts,
      },
    });
  }
}

/** The response body was not well-formed XML. */
export class XmlParseError extends AppError {
  readonly code = 'XML_PARSE_ERROR' as const;
}

/** The XML was valid but did not have the structure we expect. */
export class TransformationError extends AppError {
  readonly code = 'TRANSFORMATION_ERROR' as const;
}

/** Saving to (or reading from) the database failed. */
export class PersistenceError extends AppError {
  readonly code = 'PERSISTENCE_ERROR' as const;
}

/**
 * Somebody asked to start an ingestion while one is already in progress.
 * `runId` is null if the other run is still being registered.
 */
export class IngestionAlreadyRunningError extends AppError {
  readonly code = 'INGESTION_ALREADY_RUNNING' as const;

  constructor(readonly runId: number | null) {
    super(
      runId === null
        ? 'An ingestion run is already starting'
        : `Ingestion run ${runId} is already in progress`,
      { details: { runId } },
    );
  }
}

/** A client sent a value we cannot accept (e.g. a negative page offset). */
export class InvalidInputError extends AppError {
  readonly code = 'INVALID_INPUT' as const;
}

/**
 * Produces a short, log-friendly description of any thrown value.
 * (In JavaScript you can `throw` anything, not only Error objects.)
 */
export function describeError(error: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof Error) {
    return { code: 'UNEXPECTED_ERROR', message: error.message };
  }
  return { code: 'UNEXPECTED_ERROR', message: String(error) };
}
