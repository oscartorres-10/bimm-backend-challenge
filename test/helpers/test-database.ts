import { DataSource } from 'typeorm';
import { AppConfigService } from '../../src/config/app-config.service';
import { validateEnv } from '../../src/config/env.schema';
import { buildTypeOrmOptions } from '../../src/database/typeorm-options';

/** Environment variables for tests: in-memory SQLite unless told otherwise. */
export function testDatabaseEnv(): Record<string, string> {
  const fromProcess = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith('DB_') && entry[1] !== undefined,
    ),
  );
  return { DB_TYPE: 'sqlite', DB_SQLITE_PATH: ':memory:', ...fromProcess };
}

/** True when the tests are running against PostgreSQL. */
export const usingPostgres = () => testDatabaseEnv().DB_TYPE === 'postgres';

/**
 * Opens a connection to an EMPTY database with every migration applied.
 * For PostgreSQL the existing tables are dropped first.
 */
export async function createTestDataSource(): Promise<DataSource> {
  const env = validateEnv({ NODE_ENV: 'test', ...testDatabaseEnv() });
  const config = new AppConfigService({
    get: (key: keyof typeof env) => env[key],
  } as never);
  const dataSource = new DataSource({
    ...buildTypeOrmOptions(config.database),
    migrationsRun: false,
  });
  await dataSource.initialize();
  await resetDatabase(dataSource);
  return dataSource;
}

/** Drops everything and re-applies migrations. */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.dropDatabase();
  await dataSource.runMigrations();
}
