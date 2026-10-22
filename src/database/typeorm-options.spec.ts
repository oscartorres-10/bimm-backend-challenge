/** Unit tests for turning configuration into TypeORM connection options. */
import { buildTypeOrmOptions, MIGRATIONS } from './typeorm-options';

describe('buildTypeOrmOptions', () => {
  it('builds SQLite options with WAL enabled for a file database', () => {
    const options = buildTypeOrmOptions({
      type: 'sqlite',
      path: 'data/test.sqlite',
      logging: false,
      migrationsRun: true,
    });

    expect(options).toMatchObject({
      type: 'better-sqlite3',
      database: 'data/test.sqlite',
      enableWAL: true,
      synchronize: false,
      migrationsRun: true,
      migrations: MIGRATIONS,
    });
  });

  it('disables WAL for an in-memory SQLite database', () => {
    const options = buildTypeOrmOptions({
      type: 'sqlite',
      path: ':memory:',
      logging: false,
      migrationsRun: true,
    });
    expect(options).toMatchObject({ enableWAL: false });
  });

  it('builds PostgreSQL options from the connection settings', () => {
    const options = buildTypeOrmOptions({
      type: 'postgres',
      host: 'db',
      port: 5433,
      username: 'user',
      password: 'secret',
      database: 'vehicles',
      ssl: true,
      logging: true,
      migrationsRun: false,
    });

    expect(options).toMatchObject({
      type: 'postgres',
      host: 'db',
      port: 5433,
      username: 'user',
      password: 'secret',
      database: 'vehicles',
      ssl: { rejectUnauthorized: false },
      logging: true,
      migrationsRun: false,
      synchronize: false,
    });
  });

  it('disables SSL for PostgreSQL when not requested', () => {
    const options = buildTypeOrmOptions({
      type: 'postgres',
      host: 'db',
      port: 5432,
      username: 'u',
      password: 'p',
      database: 'd',
      ssl: false,
      logging: false,
      migrationsRun: true,
    });
    expect(options).toMatchObject({ ssl: false });
  });
});
