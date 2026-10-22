/** Unit tests for how errors are presented to API clients. */
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import {
  IngestionAlreadyRunningError,
  InvalidInputError,
  PersistenceError,
} from '../errors/app-errors';
import {
  createGraphqlErrorFormatter,
  GENERIC_ERROR_MESSAGE,
  isClientError,
  publicErrorCode,
} from './format-graphql-error';

/** Simulates how Apollo wraps an error thrown inside a resolver. */
function resolverError(original: Error): GraphQLError {
  return new GraphQLError(original.message, {
    path: ['makes'],
    originalError: original,
  });
}

function formattedFrom(error: GraphQLError): GraphQLFormattedError {
  return {
    message: error.message,
    path: ['makes'],
    extensions: { code: 'INTERNAL_SERVER_ERROR', stacktrace: ['at line 1'] },
  };
}

describe('publicErrorCode', () => {
  it('maps our own errors to public codes', () => {
    expect(
      publicErrorCode(resolverError(new InvalidInputError('bad')), undefined),
    ).toBe('BAD_USER_INPUT');
    expect(
      publicErrorCode(
        resolverError(new IngestionAlreadyRunningError(1)),
        undefined,
      ),
    ).toBe('CONFLICT');
  });

  it('keeps an existing code such as GRAPHQL_VALIDATION_FAILED', () => {
    expect(
      publicErrorCode(new GraphQLError('x'), 'GRAPHQL_VALIDATION_FAILED'),
    ).toBe('GRAPHQL_VALIDATION_FAILED');
  });

  it('falls back to INTERNAL_SERVER_ERROR', () => {
    expect(publicErrorCode(resolverError(new Error('bug')), undefined)).toBe(
      'INTERNAL_SERVER_ERROR',
    );
    expect(publicErrorCode(new GraphQLError('x'), '')).toBe(
      'INTERNAL_SERVER_ERROR',
    );
  });
});

describe('isClientError', () => {
  it('distinguishes client from server problems', () => {
    expect(isClientError('BAD_USER_INPUT')).toBe(true);
    expect(isClientError('GRAPHQL_PARSE_FAILED')).toBe(true);
    expect(isClientError('INTERNAL_SERVER_ERROR')).toBe(false);
  });
});

describe('createGraphqlErrorFormatter', () => {
  describe('in production', () => {
    const format = createGraphqlErrorFormatter(true);

    it('shows expected errors with their public code and no stack trace', () => {
      const error = resolverError(
        new InvalidInputError('limit must be between 1 and 1000'),
      );
      expect(format(formattedFrom(error), error)).toEqual({
        message: 'limit must be between 1 and 1000',
        path: ['makes'],
        extensions: { code: 'BAD_USER_INPUT' },
      });
    });

    it('hides the message of unexpected errors', () => {
      const error = resolverError(
        new PersistenceError('SQLITE_BUSY: database is locked'),
      );
      expect(format(formattedFrom(error), error)).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        path: ['makes'],
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      });
    });

    it('keeps the message of well-defined GraphQL errors', () => {
      const error = new GraphQLError('disabled', {
        extensions: { code: 'FORBIDDEN' },
      });
      const result = format(
        { message: 'disabled', extensions: { code: 'FORBIDDEN' } },
        error,
      );
      expect(result).toEqual({
        message: 'disabled',
        extensions: { code: 'FORBIDDEN' },
      });
    });
  });

  describe('outside production', () => {
    const format = createGraphqlErrorFormatter(false);

    it('keeps the real message and the stack trace to help debugging', () => {
      const error = resolverError(new Error('kaboom'));
      expect(format(formattedFrom(error), error)).toEqual({
        message: 'kaboom',
        path: ['makes'],
        extensions: {
          code: 'INTERNAL_SERVER_ERROR',
          stacktrace: ['at line 1'],
        },
      });
    });

    it('works when the error has no extensions at all', () => {
      const error = new GraphQLError('x');
      expect(format({ message: 'x' }, error)).toEqual({
        message: 'x',
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      });
    });
  });
});
