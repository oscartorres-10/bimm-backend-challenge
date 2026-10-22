import { NestFactory } from '@nestjs/core';
import { Logger, PinoLogger } from 'nestjs-pino';
import { pino, stdTimeFunctions } from 'pino';
import { AppModule } from './app.module';
import { GRAPHQL_PATH } from './common/graphql/graphql-options';
import { registerProcessErrorHandlers } from './common/lifecycle/process-error-handlers';
import { registerShutdownSignals } from './common/lifecycle/shutdown-signals';
import { AppConfigService } from './config/app-config.service';
import { SERVICE_NAME } from './logging/logger-options';

async function bootstrap(): Promise<void> {
  // `bufferLogs` holds early framework messages until our logger is ready.
  // `abortOnError: false` lets startup errors reach the catch below.
  const app = await NestFactory.create(AppModule.forRoot(), {
    bufferLogs: true,
    abortOnError: false,
  });
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const logger = await app.resolve(PinoLogger);
  logger.setContext('Bootstrap');
  registerProcessErrorHandlers(logger);

  // On SIGTERM / SIGINT: cancel ingestion, close HTTP + DB, then exit 0.
  registerShutdownSignals(app, logger);

  const config = app.get(AppConfigService);
  await app.listen(config.port, config.host);

  logger.info(
    {
      env: config.nodeEnv,
      host: config.host,
      port: config.port,
      graphql: `http://localhost:${config.port}${GRAPHQL_PATH}`,
      database: config.database.type,
    },
    'Application started',
  );
}

bootstrap().catch((error: unknown) => {
  // Our Nest logger may not exist yet, so use a plain Pino logger with the
  // same JSON format.
  pino({
    base: { service: SERVICE_NAME },
    timestamp: stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  }).fatal({ err: error }, 'Application failed to start');
  process.exit(1);
});
