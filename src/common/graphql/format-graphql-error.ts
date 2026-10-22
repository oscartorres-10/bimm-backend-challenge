import { unwrapResolverError } from '@apollo/server/errors';
import type { GraphQLFormattedError } from 'graphql';
import {
  IngestionAlreadyRunningError,
  InvalidInputError,
} from '../errors/app-errors';

export const INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR';
export const GENERIC_ERROR_MESSAGE = 'Internal server error';

/** Codes that describe a problem with the client's request, not the server. */
export const CLIENT_ERROR_CODES = new Set([
  'BAD_USER_INPUT',
  'CONFLICT',
  'FORBIDDEN',
  'GRAPHQL_PARSE_FAILED',
  'GRAPHQL_VALIDATION_FAILED',
  'BAD_REQUEST',
  'PERSISTED_QUERY_NOT_FOUND',
  'PERSISTED_QUERY_NOT_SUPPORTED',
  'OPERATION_RESOLUTION_FAILURE',
]);

/** Maps our error classes to public GraphQL error codes. */
function codeForAppError(error: unknown): string | null {
  if (error instanceof InvalidInputError) return 'BAD_USER_INPUT';
  if (error instanceof IngestionAlreadyRunningError) return 'CONFLICT';
  return null;
}

/**
 * The code a client will see for this error.
 * @param error         - the error Apollo reports (may wrap our own error).
 * @param extensionCode - `extensions.code` already set on it, if any.
 */
export function publicErrorCode(
  error: unknown,
  extensionCode: unknown,
): string {
  const mapped = codeForAppError(unwrapResolverError(error));
  if (mapped) return mapped;
  if (typeof extensionCode === 'string' && extensionCode !== '') {
    return extensionCode;
  }
  return INTERNAL_SERVER_ERROR;
}

/** True when the error was caused by the client rather than by the server. */
export function isClientError(code: string): boolean {
  return CLIENT_ERROR_CODES.has(code);
}

/**
 * Builds a `formatError` function for Apollo Server.
 * @param isProduction - hide internal messages and stack traces when true.
 */
export function createGraphqlErrorFormatter(isProduction: boolean) {
  return (
    formatted: GraphQLFormattedError,
    error: unknown,
  ): GraphQLFormattedError => {
    const { stacktrace, ...extensions } = formatted.extensions ?? {};
    const code = publicErrorCode(error, extensions.code);
    const hideMessage = isProduction && code === INTERNAL_SERVER_ERROR;

    return {
      ...formatted,
      message: hideMessage ? GENERIC_ERROR_MESSAGE : formatted.message,
      extensions: {
        ...extensions,
        code,
        ...(isProduction || stacktrace === undefined ? {} : { stacktrace }),
      },
    };
  };
}
