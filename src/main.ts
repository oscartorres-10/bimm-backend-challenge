import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  // abortOnError: false lets a bad environment reach the catch below.
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  const config = app.get(AppConfigService);
  await app.listen(config.port, config.host);
  console.log(
    `Application started env=${config.nodeEnv} host=${config.host} port=${config.port}`,
  );
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
