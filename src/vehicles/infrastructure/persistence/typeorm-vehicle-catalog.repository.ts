import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { chunk } from '../../../common/utils/concurrency';
import type { VehicleType } from '../../domain/vehicle-catalog.model';
import {
  type CatalogBatch,
  type FindMakesQuery,
  type Page,
  type StoredMake,
  VehicleCatalogRepository,
} from '../../domain/vehicle-catalog.repository';
import {
  MakeEntity,
  MakeVehicleTypeEntity,
  VehicleTypeEntity,
} from './entities';
import { withPersistenceErrors } from './with-persistence-errors';

const MAX_ROWS_PER_INSERT = 1_000;

/** Converts a database row into the domain shape. */
function toStoredMake(entity: MakeEntity): StoredMake {
  return {
    makeId: entity.id,
    makeName: entity.name,
    vehicleTypesSyncedAt: entity.vehicleTypesSyncedAt,
    lastIngestedAt: entity.lastIngestedAt,
  };
}

/**
 * Escapes `%`, `_` and `\` so user input is matched literally in a LIKE
 * pattern (otherwise searching for "_" would match every character).
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

@Injectable()
export class TypeOrmVehicleCatalogRepository extends VehicleCatalogRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async saveBatch({
    entries,
    makesWithoutTypeData,
  }: CatalogBatch): Promise<void> {
    if (entries.length === 0 && makesWithoutTypeData.length === 0) return;

    await withPersistenceErrors('saveBatch', () =>
      // A transaction makes the whole batch "all or nothing": if any
      // statement fails, every change in the batch is rolled back.
      this.dataSource.transaction(async (manager) => {
        const now = new Date();

        // 1. Vehicle types (deduplicated: "Truck" appears for many makes).
        const typesById = new Map<number, VehicleType>();
        for (const entry of entries) {
          for (const type of entry.vehicleTypes)
            typesById.set(type.typeId, type);
        }
        await this.upsertRows(
          manager,
          VehicleTypeEntity,
          [...typesById.values()].map((type) => ({
            id: type.typeId,
            name: type.typeName,
          })),
          ['name'],
        );

        // 2. Makes with fresh vehicle type data: also stamp the sync time.
        await this.upsertRows(
          manager,
          MakeEntity,
          entries.map((entry) => ({
            id: entry.makeId,
            name: entry.makeName,
            vehicleTypesSyncedAt: now,
            lastIngestedAt: now,
          })),
          ['name', 'vehicle_types_synced_at', 'last_ingested_at'],
        );

        // 3. Makes without fresh type data: update only name and timestamp.
        await this.upsertRows(
          manager,
          MakeEntity,
          makesWithoutTypeData.map((make) => ({
            id: make.makeId,
            name: make.makeName,
            vehicleTypesSyncedAt: null,
            lastIngestedAt: now,
          })),
          ['name', 'last_ingested_at'],
        );

        // 4. Replace the make <-> type links of the freshly synced makes.
        const syncedMakeIds = entries.map((entry) => entry.makeId);
        for (const ids of chunk(syncedMakeIds, MAX_ROWS_PER_INSERT)) {
          await manager.delete(MakeVehicleTypeEntity, { makeId: In(ids) });
        }
        const links = entries.flatMap((entry) =>
          entry.vehicleTypes.map((type) => ({
            makeId: entry.makeId,
            vehicleTypeId: type.typeId,
          })),
        );
        for (const rows of chunk(links, MAX_ROWS_PER_INSERT)) {
          await manager.insert(MakeVehicleTypeEntity, rows);
        }
      }),
    );
  }

  private async upsertRows<E extends object>(
    manager: EntityManager,
    entity: new () => E,
    rows: Partial<E>[],
    updateColumns: string[],
  ): Promise<void> {
    for (const part of chunk(rows, MAX_ROWS_PER_INSERT)) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(entity)
        .values(part as never)
        .orUpdate(updateColumns, ['id'])
        .execute();
    }
  }

  findMakes(query: FindMakesQuery): Promise<Page<StoredMake>> {
    return withPersistenceErrors('findMakes', async () => {
      const qb = this.dataSource
        .getRepository(MakeEntity)
        .createQueryBuilder('make');

      if (query.nameContains) {
        // LOWER(...) on both sides = case-insensitive on every database.
        qb.andWhere("LOWER(make.name) LIKE :pattern ESCAPE '\\'", {
          pattern: `%${escapeLikePattern(query.nameContains.toLowerCase())}%`,
        });
      }
      if (query.vehicleTypeId !== undefined) {
        qb.andWhere(
          'make.id IN (SELECT link.make_id FROM make_vehicle_types link WHERE link.vehicle_type_id = :typeId)',
          { typeId: query.vehicleTypeId },
        );
      }

      const [rows, totalCount] = await qb
        .orderBy('make.name', 'ASC')
        .addOrderBy('make.id', 'ASC')
        .offset(query.offset)
        .limit(query.limit)
        .getManyAndCount();

      return { items: rows.map(toStoredMake), totalCount };
    });
  }

  findMakeById(makeId: number): Promise<StoredMake | null> {
    return withPersistenceErrors('findMakeById', async () => {
      const row = await this.dataSource
        .getRepository(MakeEntity)
        .findOneBy({ id: makeId });
      return row ? toStoredMake(row) : null;
    });
  }

  findVehicleTypesByMakeIds(
    makeIds: readonly number[],
  ): Promise<Map<number, VehicleType[]>> {
    return withPersistenceErrors('findVehicleTypesByMakeIds', async () => {
      const result = new Map<number, VehicleType[]>(
        makeIds.map((id) => [id, []]),
      );
      for (const ids of chunk([...new Set(makeIds)], MAX_ROWS_PER_INSERT)) {
        const rows = await this.dataSource
          .getRepository(MakeVehicleTypeEntity)
          .createQueryBuilder('link')
          .innerJoinAndSelect('link.vehicleType', 'type')
          .where('link.make_id IN (:...ids)', { ids })
          .orderBy('link.make_id', 'ASC')
          .addOrderBy('type.id', 'ASC')
          .getMany();

        for (const row of rows) {
          result.get(row.makeId)?.push({
            typeId: row.vehicleType!.id,
            typeName: row.vehicleType!.name,
          });
        }
      }
      return result;
    });
  }

  findAllVehicleTypes(): Promise<VehicleType[]> {
    return withPersistenceErrors('findAllVehicleTypes', async () => {
      const rows = await this.dataSource
        .getRepository(VehicleTypeEntity)
        .find({ order: { id: 'ASC' } });
      return rows.map((row) => ({ typeId: row.id, typeName: row.name }));
    });
  }

  countMakes(): Promise<number> {
    return withPersistenceErrors('countMakes', () =>
      this.dataSource.getRepository(MakeEntity).count(),
    );
  }
}
