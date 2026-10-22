import { join } from 'node:path';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import type { Request, Response } from 'express';
import type { AppConfigService } from '../../config/app-config.service';
import { createGraphqlErrorFormatter } from './format-graphql-error';

export const GRAPHQL_PATH = '/graphql';

export function buildGraphqlOptions(
  config: AppConfigService,
): Omit<ApolloDriverConfig, 'driver'> {
  const { introspection, playground } = config.graphql;
  return {
    path: GRAPHQL_PATH,
    autoSchemaFile:
      config.nodeEnv === 'development'
        ? join(process.cwd(), 'schema.gql')
        : true,
    sortSchema: true,
    introspection,
    // The legacy GraphQL Playground is deprecated; Apollo Sandbox replaces it.
    playground: false,
    // Cast: @nestjs/apollo is typed against Apollo's ESM declarations while
    // this CommonJS file sees the CJS ones; the runtime objects are identical.
    plugins: [
      playground
        ? ApolloServerPluginLandingPageLocalDefault({ embed: true })
        : ApolloServerPluginLandingPageDisabled(),
    ] as unknown as ApolloDriverConfig['plugins'],
    includeStacktraceInErrorResponses: !config.isProduction,
    formatError: createGraphqlErrorFormatter(config.isProduction),
    // A fresh object per request: used as the key for per-request DataLoaders.
    context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
  };
}
