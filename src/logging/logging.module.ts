import { DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../config/app-config.service';
import { buildLoggerOptions } from './logger-options';

@Module({})
export class LoggingModule {
  static forRoot(): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [AppConfigService],
          useFactory: (config: AppConfigService) =>
            buildLoggerOptions(config.logging, config.nodeEnv),
        }),
      ],
    };
  }
}
