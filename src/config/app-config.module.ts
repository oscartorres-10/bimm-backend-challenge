/**
 * Configuration module.
 *
 * A NestJS "module" is a box that groups related classes and declares which
 * of them other parts of the app may use. This one:
 *   1. loads `.env` files (most specific first, see `envFilePaths`);
 *   2. validates everything with `validateEnv` (the app will not start if
 *      the configuration is invalid);
 *   3. offers `AppConfigService` to the whole application (`@Global`).
 *
 * Priority (highest first): `overrides` passed in code (used by tests),
 * real environment variables, `.env.<NODE_ENV>.local`, `.env.<NODE_ENV>`,
 * `.env`, then the defaults in `env.schema.ts`.
 */
import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { envFilePaths } from './env-file-paths';
import { validateEnv } from './env.schema';

@Global()
@Module({})
export class AppConfigModule {
  /**
   * @param overrides - values that win over everything else. Tests use this
   *                    to configure the app without touching process.env.
   */
  static forRoot(overrides: Record<string, string> = {}): DynamicModule {
    return {
      module: AppConfigModule,
      imports: [
        ConfigModule.forRoot({
          envFilePath: envFilePaths(overrides.NODE_ENV),
          validate: (raw) => validateEnv({ ...raw, ...overrides }),
          cache: true,
        }),
      ],
      providers: [AppConfigService],
      exports: [AppConfigService],
    };
  }
}
