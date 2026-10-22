/**
 * Unit tests for configuration validation.
 * They prove that defaults are applied, text is converted to the right types,
 * and bad values stop the app with a helpful message.
 */
import { InvalidConfigurationError, validateEnv } from './env.schema';
import { envFilePaths } from './env-file-paths';

describe('validateEnv', () => {
  it('applies sensible defaults when nothing is set', () => {
    const env = validateEnv({});

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DB_TYPE).toBe('sqlite');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.FEATURE_INGESTION_ON_STARTUP).toBe(true);
  });

  it('converts strings into numbers and booleans', () => {
    const env = validateEnv({
      PORT: '8080',
      LOG_PRETTY: 'yes',
      FEATURE_INGESTION_ON_STARTUP: '0',
      INGESTION_CONCURRENCY: '10',
    });

    expect(env.PORT).toBe(8080);
    expect(env.LOG_PRETTY).toBe(true);
    expect(env.FEATURE_INGESTION_ON_STARTUP).toBe(false);
    expect(env.INGESTION_CONCURRENCY).toBe(10);
  });

  it('treats empty strings as "not set"', () => {
    expect(validateEnv({ PORT: '' }).PORT).toBe(3000);
  });

  it('drops variables it does not know about', () => {
    expect(validateEnv({ SOMETHING_ELSE: 'x' })).not.toHaveProperty(
      'SOMETHING_ELSE',
    );
  });

  it('reports every invalid variable at once', () => {
    let error: unknown;
    try {
      validateEnv({ PORT: 'abc', LOG_LEVEL: 'loud', DB_TYPE: 'oracle' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(InvalidConfigurationError);
    const issues = (error as InvalidConfigurationError).issues;
    expect(issues).toHaveLength(3);
    expect(issues.join()).toMatch(/PORT/);
  });

  it('rejects out-of-range numbers', () => {
    expect(() => validateEnv({ PORT: '70000' })).toThrow(/PORT/);
    expect(() => validateEnv({ INGESTION_CONCURRENCY: '0' })).toThrow(
      /INGESTION_CONCURRENCY/,
    );
  });

  it('requires the {makeId} placeholder in the vehicle types URL', () => {
    expect(() =>
      validateEnv({
        VPIC_VEHICLE_TYPES_URL_TEMPLATE: 'https://example.com/types',
      }),
    ).toThrow(/placeholder/);
  });

  it('rejects an invalid URL', () => {
    expect(() => validateEnv({ VPIC_ALL_MAKES_URL: 'not a url' })).toThrow(
      /VPIC_ALL_MAKES_URL/,
    );
  });

  it('forbids an in-memory SQLite database in production', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'production', DB_SQLITE_PATH: ':memory:' }),
    ).toThrow(/in-memory/);
    expect(() =>
      validateEnv({ NODE_ENV: 'test', DB_SQLITE_PATH: ':memory:' }),
    ).not.toThrow();
  });
});

describe('envFilePaths', () => {
  it('lists the most specific file first', () => {
    expect(envFilePaths('test')).toEqual([
      '.env.test.local',
      '.env.test',
      '.env',
    ]);
  });
});
