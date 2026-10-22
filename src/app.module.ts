import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { DynamicModule, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { buildGraphqlOptions } from './common/graphql/graphql-options';
import { GraphqlLoggingPlugin } from './common/graphql/graphql-logging.plugin';
import { LifecycleLoggerService } from './common/lifecycle/lifecycle-logger.service';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { DatabaseModule } from './database/database.module';
import { LoggingModule } from './logging/logging.module';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({})
export class AppModule {
  static forRoot(configOverrides: Record<string, string> = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(configOverrides),
        LoggingModule.forRoot(),
        DatabaseModule,
        GraphQLModule.forRootAsync<ApolloDriverConfig>({
          driver: ApolloDriver,
          inject: [AppConfigService],
          useFactory: buildGraphqlOptions,
        }),
        VehiclesModule,
      ],
      providers: [LifecycleLoggerService, GraphqlLoggingPlugin],
    };
  }
}
