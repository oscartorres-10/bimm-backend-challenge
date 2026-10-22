import {
  type MigrationInterface,
  type QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class InitialSchema1792692080445 implements MigrationInterface {
  /** Applies the migration (creates tables). */
  async up(queryRunner: QueryRunner): Promise<void> {
    // "timestamp" on PostgreSQL, "datetime" on SQLite.
    const dateTime = queryRunner.connection.driver.normalizeType({
      type: Date,
    });

    await queryRunner.createTable(
      new Table({
        name: 'makes',
        columns: [
          { name: 'id', type: 'integer', isPrimary: true },
          { name: 'name', type: 'varchar', length: '255' },
          { name: 'vehicle_types_synced_at', type: dateTime, isNullable: true },
          { name: 'last_ingested_at', type: dateTime },
        ],
        indices: [
          new TableIndex({ name: 'idx_makes_name', columnNames: ['name'] }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'vehicle_types',
        columns: [
          { name: 'id', type: 'integer', isPrimary: true },
          { name: 'name', type: 'varchar', length: '255' },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'make_vehicle_types',
        columns: [
          { name: 'make_id', type: 'integer', isPrimary: true },
          { name: 'vehicle_type_id', type: 'integer', isPrimary: true },
        ],
        indices: [
          new TableIndex({
            name: 'idx_make_vehicle_types_vehicle_type_id',
            columnNames: ['vehicle_type_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['make_id'],
            referencedTableName: 'makes',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            columnNames: ['vehicle_type_id'],
            referencedTableName: 'vehicle_types',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'ingestion_runs',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'status', type: 'varchar', length: '32' },
          { name: 'trigger', type: 'varchar', length: '32' },
          { name: 'started_at', type: dateTime },
          { name: 'finished_at', type: dateTime, isNullable: true },
          { name: 'total_makes', type: 'integer', default: 0 },
          { name: 'processed_makes', type: 'integer', default: 0 },
          { name: 'failed_makes', type: 'integer', default: 0 },
          { name: 'rejected_records', type: 'integer', default: 0 },
          { name: 'error_message', type: 'text', isNullable: true },
        ],
        indices: [
          new TableIndex({
            name: 'idx_ingestion_runs_status',
            columnNames: ['status'],
          }),
        ],
      }),
    );
  }

  /** Reverts the migration (drops tables, children first). */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ingestion_runs');
    await queryRunner.dropTable('make_vehicle_types');
    await queryRunner.dropTable('vehicle_types');
    await queryRunner.dropTable('makes');
  }
}
