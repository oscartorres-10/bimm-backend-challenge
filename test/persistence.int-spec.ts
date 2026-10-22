import { DataSource } from 'typeorm';
import { PersistenceError } from '../src/common/errors/app-errors';
import {
  IngestionStatus,
  IngestionTrigger,
} from '../src/vehicles/domain/vehicle-catalog.model';
import { TypeOrmIngestionRunRepository } from '../src/vehicles/infrastructure/persistence/typeorm-ingestion-run.repository';
import { TypeOrmVehicleCatalogRepository } from '../src/vehicles/infrastructure/persistence/typeorm-vehicle-catalog.repository';
import { createTestDataSource, resetDatabase } from './helpers/test-database';

describe('Persistence (integration)', () => {
  let dataSource: DataSource;
  let catalog: TypeOrmVehicleCatalogRepository;
  let runs: TypeOrmIngestionRunRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    catalog = new TypeOrmVehicleCatalogRepository(dataSource);
    runs = new TypeOrmIngestionRunRepository(dataSource);
  });

  beforeEach(() => resetDatabase(dataSource));

  afterAll(() => dataSource.destroy());

  describe('schema', () => {
    it('migrations produce exactly the schema described by the entities', async () => {
      // Ask TypeORM which SQL it WOULD run to make the database match the
      // entities. If the migration is correct, the answer is "nothing".
      const pending = await dataSource.driver.createSchemaBuilder().log();
      expect(pending.upQueries.map((query) => query.query)).toEqual([]);
    });
  });

  describe('TypeOrmVehicleCatalogRepository', () => {
    const astonMartin = {
      makeId: 440,
      makeName: 'ASTON MARTIN',
      vehicleTypes: [
        { typeId: 2, typeName: 'Passenger Car' },
        { typeId: 7, typeName: 'Multipurpose Passenger Vehicle (MPV)' },
      ],
    };
    const honda = {
      makeId: 474,
      makeName: 'HONDA',
      vehicleTypes: [
        { typeId: 1, typeName: 'Motorcycle' },
        { typeId: 2, typeName: 'Passenger Car' },
      ],
    };

    it('saves a batch and reads it back in the unified shape', async () => {
      await catalog.saveBatch({
        entries: [honda, astonMartin],
        makesWithoutTypeData: [],
      });

      const page = await catalog.findMakes({ offset: 0, limit: 10 });
      expect(page.totalCount).toBe(2);
      expect(page.items.map((make) => make.makeName)).toEqual([
        'ASTON MARTIN',
        'HONDA',
      ]);
      expect(page.items[0].vehicleTypesSyncedAt).toBeInstanceOf(Date);

      const types = await catalog.findVehicleTypesByMakeIds([440, 474, 1]);
      expect(types.get(440)).toEqual(astonMartin.vehicleTypes);
      expect(types.get(474)).toEqual(honda.vehicleTypes);
      expect(types.get(1)).toEqual([]);

      expect(await catalog.findAllVehicleTypes()).toEqual([
        { typeId: 1, typeName: 'Motorcycle' },
        { typeId: 2, typeName: 'Passenger Car' },
        { typeId: 7, typeName: 'Multipurpose Passenger Vehicle (MPV)' },
      ]);
    });

    it('is idempotent and replaces the vehicle types of re-synced makes', async () => {
      await catalog.saveBatch({
        entries: [astonMartin],
        makesWithoutTypeData: [],
      });
      await catalog.saveBatch({
        entries: [
          {
            makeId: 440,
            makeName: 'ASTON MARTIN LAGONDA',
            vehicleTypes: [{ typeId: 3, typeName: 'Truck' }],
          },
        ],
        makesWithoutTypeData: [],
      });

      expect(await catalog.countMakes()).toBe(1);
      expect((await catalog.findMakeById(440))?.makeName).toBe(
        'ASTON MARTIN LAGONDA',
      );
      expect((await catalog.findVehicleTypesByMakeIds([440])).get(440)).toEqual(
        [{ typeId: 3, typeName: 'Truck' }],
      );
    });

    it('keeps previous vehicle types when fresh data could not be fetched', async () => {
      await catalog.saveBatch({
        entries: [astonMartin],
        makesWithoutTypeData: [],
      });
      const before = await catalog.findMakeById(440);

      await catalog.saveBatch({
        entries: [],
        makesWithoutTypeData: [{ makeId: 440, makeName: 'ASTON MARTIN' }],
      });

      const after = await catalog.findMakeById(440);
      expect(after?.vehicleTypesSyncedAt).toEqual(before?.vehicleTypesSyncedAt);
      expect((await catalog.findVehicleTypesByMakeIds([440])).get(440)).toEqual(
        astonMartin.vehicleTypes,
      );
    });

    it('stores a never-synced make with a null sync date', async () => {
      await catalog.saveBatch({
        entries: [],
        makesWithoutTypeData: [{ makeId: 1, makeName: 'NEW MAKE' }],
      });
      expect(await catalog.findMakeById(1)).toMatchObject({
        makeId: 1,
        makeName: 'NEW MAKE',
        vehicleTypesSyncedAt: null,
      });
    });

    it('does nothing for an empty batch', async () => {
      await catalog.saveBatch({ entries: [], makesWithoutTypeData: [] });
      expect(await catalog.countMakes()).toBe(0);
    });

    it('filters by name (case-insensitive, wildcards matched literally) and vehicle type', async () => {
      await catalog.saveBatch({
        entries: [
          astonMartin,
          honda,
          { makeId: 5, makeName: '100%_REAL', vehicleTypes: [] },
        ],
        makesWithoutTypeData: [],
      });

      const byName = await catalog.findMakes({
        nameContains: 'mArTi',
        offset: 0,
        limit: 10,
      });
      expect(byName.items.map((make) => make.makeId)).toEqual([440]);

      const literal = await catalog.findMakes({
        nameContains: '%_',
        offset: 0,
        limit: 10,
      });
      expect(literal.items.map((make) => make.makeId)).toEqual([5]);

      const byType = await catalog.findMakes({
        vehicleTypeId: 1,
        offset: 0,
        limit: 10,
      });
      expect(byType.items.map((make) => make.makeId)).toEqual([474]);
    });

    it('paginates and still reports the total count', async () => {
      await catalog.saveBatch({
        entries: Array.from({ length: 5 }, (_, index) => ({
          makeId: index + 1,
          makeName: `MAKE ${index + 1}`,
          vehicleTypes: [],
        })),
        makesWithoutTypeData: [],
      });

      const page = await catalog.findMakes({ offset: 2, limit: 2 });
      expect(page.totalCount).toBe(5);
      expect(page.items.map((make) => make.makeId)).toEqual([3, 4]);
    });

    it('handles batches larger than a single INSERT allows', async () => {
      const entries = Array.from({ length: 1_500 }, (_, index) => ({
        makeId: index + 1,
        makeName: `MAKE ${index + 1}`,
        vehicleTypes: [{ typeId: 2, typeName: 'Passenger Car' }],
      }));
      await catalog.saveBatch({ entries, makesWithoutTypeData: [] });

      expect(await catalog.countMakes()).toBe(1_500);
      const types = await catalog.findVehicleTypesByMakeIds(
        entries.map((entry) => entry.makeId),
      );
      expect(types.get(1_500)).toEqual([
        { typeId: 2, typeName: 'Passenger Car' },
      ]);
    });

    it('wraps database failures in PersistenceError', async () => {
      const broken = new TypeOrmVehicleCatalogRepository({
        transaction: () => Promise.reject(new Error('disk full')),
      } as unknown as DataSource);

      await expect(
        broken.saveBatch({ entries: [astonMartin], makesWithoutTypeData: [] }),
      ).rejects.toThrow(PersistenceError);
    });
  });

  describe('TypeOrmIngestionRunRepository', () => {
    it('creates, updates and finds runs', async () => {
      const run = await runs.create(IngestionTrigger.MANUAL);
      expect(run).toMatchObject({
        status: IngestionStatus.RUNNING,
        trigger: IngestionTrigger.MANUAL,
        processedMakes: 0,
        finishedAt: null,
      });

      const updated = await runs.update(run.id, {
        status: IngestionStatus.SUCCEEDED,
        processedMakes: 10,
        finishedAt: new Date(),
      });
      expect(updated).toMatchObject({
        status: IngestionStatus.SUCCEEDED,
        processedMakes: 10,
      });
      expect(await runs.findById(run.id)).toEqual(updated);
      expect(await runs.findById(9_999)).toBeNull();
    });

    it('returns the latest run', async () => {
      expect(await runs.findLatest()).toBeNull();
      await runs.create(IngestionTrigger.STARTUP);
      const second = await runs.create(IngestionTrigger.MANUAL);
      expect((await runs.findLatest())?.id).toBe(second.id);
    });

    it('marks interrupted runs as failed', async () => {
      const running = await runs.create(IngestionTrigger.STARTUP);
      const done = await runs.create(IngestionTrigger.MANUAL);
      await runs.update(done.id, { status: IngestionStatus.SUCCEEDED });

      expect(await runs.failInterruptedRuns('interrupted')).toBe(1);
      expect(await runs.findById(running.id)).toMatchObject({
        status: IngestionStatus.FAILED,
        errorMessage: 'interrupted',
      });
      expect((await runs.findById(done.id))?.status).toBe(
        IngestionStatus.SUCCEEDED,
      );
    });
  });
});
