import type {
  ApolloServerPlugin,
  GraphQLRequestContextDidEncounterErrors,
  GraphQLRequestListener,
} from '@apollo/server';
import { unwrapResolverError } from '@apollo/server/errors';
import { Plugin } from '@nestjs/apollo';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppError, describeError } from '../errors/app-errors';
import { isClientError, publicErrorCode } from './format-graphql-error';

@Plugin()
export class GraphqlLoggingPlugin implements ApolloServerPlugin {
  constructor(
    @InjectPinoLogger(GraphqlLoggingPlugin.name)
    private readonly logger: PinoLogger,
  ) {}

  /** Called by Apollo at the start of every GraphQL request. */
  requestDidStart(): Promise<GraphQLRequestListener<object>> {
    return Promise.resolve({
      didEncounterErrors: (context) => {
        this.logErrors(context);
        return Promise.resolve();
      },
    });
  }

  /** Writes one log entry per error in the request. */
  logErrors(context: GraphQLRequestContextDidEncounterErrors<object>): void {
    for (const error of context.errors) {
      const original = unwrapResolverError(error);
      const code = publicErrorCode(error, error.extensions?.code);
      const entry = {
        operationName: context.operationName ?? context.request.operationName,
        path: error.path,
        code,
        error:
          original instanceof AppError
            ? describeError(original)
            : { message: error.message },
      };
      if (isClientError(code)) {
        this.logger.warn(entry, 'GraphQL request rejected');
      } else {
        this.logger.error(
          { ...entry, err: original },
          'GraphQL request failed',
        );
      }
    }
  }
}
