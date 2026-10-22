import type { PinoLogger } from 'nestjs-pino';
import { jest } from './jest';
import { AppConfigService } from '../../src/config/app-config.service';
import { validateEnv } from '../../src/config/env.schema';

export function createTestConfig(
  overrides: Record<string, string> = {},
): AppConfigService {
  const env = validateEnv({
    NODE_ENV: 'test',
    HTTP_RETRY_BASE_DELAY_MS: '0',
    DB_SQLITE_PATH: ':memory:',
    FEATURE_INGESTION_ON_STARTUP: 'false',
    ...overrides,
  });
  // AppConfigService only needs an object with a `get(key)` method.
  const configService = { get: (key: keyof typeof env) => env[key] };
  return new AppConfigService(configService as never);
}

/** A logger whose methods are Jest mocks, so tests can assert on log calls. */
export type MockLogger = jest.Mocked<
  Pick<PinoLogger, 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'>
>;

export function createMockLogger(): MockLogger & PinoLogger {
  return {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  } as unknown as MockLogger & PinoLogger;
}

/** Creates a fetch Response with an XML body. */
export function xmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}
