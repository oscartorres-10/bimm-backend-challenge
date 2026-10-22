import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '../config/app-config.service';
import { buildTypeOrmOptions } from './typeorm-options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const db = config.database;
        // SQLite cannot create missing folders for its file; do it for it.
        if (db.type === 'sqlite' && db.path !== ':memory:') {
          mkdirSync(dirname(db.path), { recursive: true });
        }
        return {
          ...buildTypeOrmOptions(db),
          retryAttempts: config.nodeEnv === 'test' ? 0 : 10,
          retryDelay: 3_000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
