/** Unit tests for logging GraphQL request failures. */
import type { GraphQLRequestContextDidEncounterErrors } from '@apollo/server';
import { GraphQLError } from 'graphql';
import { createMockLogger } from '../../../test/helpers/test-doubles';
import { InvalidInputError } from '../errors/app-errors';
import { GraphqlLoggingPlugin } from './graphql-logging.plugin';

function contextWith(...errors: GraphQLError[]) {
  return {
    errors,
    operationName: 'ListMakes',
    request: {},
  } as unknown as GraphQLRequestContextDidEncounterErrors<object>;
}

describe('GraphqlLoggingPlugin', () => {
  it('logs client mistakes as warnings', async () => {
    const logger = createMockLogger();
    const plugin = new GraphqlLoggingPlugin(logger);
    const listener = await plugin.requestDidStart();

    await listener.didEncounterErrors?.(
      contextWith(
        new GraphQLError('limit too big', {
          path: ['makes'],
          originalError: new InvalidInputError('limit too big'),
        }),
        new GraphQLError('Cannot query field "nope"', {
          extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
        }),
      ),
    );

    expect(logger.warn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationName: 'ListMakes',
        code: 'BAD_USER_INPUT',
        error: expect.objectContaining({ code: 'INVALID_INPUT' }),
      }),
      'GraphQL request rejected',
    );
    expect(logger.warn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        code: 'GRAPHQL_VALIDATION_FAILED',
        error: { message: 'Cannot query field "nope"' },
      }),
      'GraphQL request rejected',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs unexpected failures as errors with the original error', () => {
    const logger = createMockLogger();
    const plugin = new GraphqlLoggingPlugin(logger);
    const bug = new TypeError('undefined is not a function');

    plugin.logErrors(
      contextWith(
        new GraphQLError(bug.message, { path: ['makes'], originalError: bug }),
      ),
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR', err: bug }),
      'GraphQL request failed',
    );
  });
});
