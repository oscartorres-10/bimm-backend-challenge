import type { DataSourceOptions } from 'typeorm';
import type { DatabaseSettings } from '../config/app-config.service';
import { ENTITIES } from '../vehicles/infrastructure/persistence/entities';
import { InitialSchema1792692080445 } from './migrations/1792692080445-initial-schema';

/** Every migration, in order. Listed explicitly (no file globbing) so it works the same from `src` and `dist`. */
export const MIGRATIONS = [InitialSchema1792692080445];

export function buildTypeOrmOptions(db: DatabaseSettings): DataSourceOptions {
  const common = {
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsRun: db.migrationsRun,
    // Never let TypeORM change tables on its own; migrations do that.
    synchronize: false,
    logging: db.logging,
  } as const;

  if (db.type === 'postgres') {
    return {
      ...common,
      type: 'postgres',
      host: db.host,
      port: db.port,
      username: db.username,
      password: db.password,
      database: db.database,
      ssl: db.ssl ? { rejectUnauthorized: false } : false,
      // Connection pool: up to 10 open connections shared by all requests.
      extra: { max: 10 },
    };
  }

  return {
    ...common,
    type: 'better-sqlite3',
    database: db.path,
    // Write-ahead logging lets readers keep working while a batch is written.
    enableWAL: db.path !== ':memory:',
  };
}
