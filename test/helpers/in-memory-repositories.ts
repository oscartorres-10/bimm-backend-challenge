/**
 * Simple in-memory versions of the repositories, for unit tests.
 *
 * They behave like the real database implementations (same contract) but
 * keep data in JavaScript Maps, so application logic can be tested quickly
 * and in isolation from any database.
 */
import {
  type CatalogEntry,
  type IngestionRun,
  IngestionStatus,
  IngestionTrigger,
  type VehicleType,
} from '../../src/vehicles/domain/vehicle-catalog.model';
import {
  type CatalogBatch,
  type FindMakesQuery,
  IngestionRunRepository,
  type IngestionRunUpdate,
  type Page,
  type StoredMake,
  VehicleCatalogRepository,
} from '../../src/vehicles/domain/vehicle-catalog.repository';

export class InMemoryVehicleCatalogRepository extends VehicleCatalogRepository {
  readonly makes = new Map<number, StoredMake>();
  readonly typesByMake = new Map<number, VehicleType[]>();
  /** Every batch received, to let tests inspect what was saved. */
  readonly batches: CatalogBatch[] = [];

  saveBatch(batch: CatalogBatch): Promise<void> {
    this.batches.push(batch);
    const now = new Date();
    for (const entry of batch.entries) {
      this.makes.set(entry.makeId, {
        makeId: entry.makeId,
        makeName: entry.makeName,
        vehicleTypesSyncedAt: now,
        lastIngestedAt: now,
      });
      this.typesByMake.set(entry.makeId, entry.vehicleTypes);
    }
    for (const make of batch.makesWithoutTypeData) {
      const existing = this.makes.get(make.makeId);
      this.makes.set(make.makeId, {
        ...make,
        vehicleTypesSyncedAt: existing?.vehicleTypesSyncedAt ?? null,
        lastIngestedAt: now,
      });
    }
    return Promise.resolve();
  }

  findMakes(query: FindMakesQuery): Promise<Page<StoredMake>> {
    const matches = [...this.makes.values()]
      .filter(
        (make) =>
          !query.nameContains ||
          make.makeName
            .toLowerCase()
            .includes(query.nameContains.toLowerCase()),
      )
      .filter(
        (make) =>
          query.vehicleTypeId === undefined ||
          (this.typesByMake.get(make.makeId) ?? []).some(
            (type) => type.typeId === query.vehicleTypeId,
          ),
      )
      .sort(
        (a, b) => a.makeName.localeCompare(b.makeName) || a.makeId - b.makeId,
      );
    return Promise.resolve({
      items: matches.slice(query.offset, query.offset + query.limit),
      totalCount: matches.length,
    });
  }

  findMakeById(makeId: number): Promise<StoredMake | null> {
    return Promise.resolve(this.makes.get(makeId) ?? null);
  }

  findVehicleTypesByMakeIds(
    makeIds: readonly number[],
  ): Promise<Map<number, VehicleType[]>> {
    return Promise.resolve(
      new Map(makeIds.map((id) => [id, this.typesByMake.get(id) ?? []])),
    );
  }

  findAllVehicleTypes(): Promise<VehicleType[]> {
    const byId = new Map<number, VehicleType>();
    for (const types of this.typesByMake.values()) {
      for (const type of types) byId.set(type.typeId, type);
    }
    return Promise.resolve(
      [...byId.values()].sort((a, b) => a.typeId - b.typeId),
    );
  }

  countMakes(): Promise<number> {
    return Promise.resolve(this.makes.size);
  }

  /** Test convenience: the stored data in the unified JSON shape. */
  catalog(): CatalogEntry[] {
    return [...this.makes.values()].map((make) => ({
      makeId: make.makeId,
      makeName: make.makeName,
      vehicleTypes: this.typesByMake.get(make.makeId) ?? [],
    }));
  }
}

export class InMemoryIngestionRunRepository extends IngestionRunRepository {
  readonly runs = new Map<number, IngestionRun>();
  private nextId = 1;

  create(trigger: IngestionTrigger): Promise<IngestionRun> {
    const run: IngestionRun = {
      id: this.nextId++,
      status: IngestionStatus.RUNNING,
      trigger,
      startedAt: new Date(),
      finishedAt: null,
      totalMakes: 0,
      processedMakes: 0,
      failedMakes: 0,
      rejectedRecords: 0,
      errorMessage: null,
    };
    this.runs.set(run.id, run);
    return Promise.resolve({ ...run });
  }

  update(id: number, changes: IngestionRunUpdate): Promise<IngestionRun> {
    const run = this.runs.get(id);
    if (!run) return Promise.reject(new Error(`run ${id} not found`));
    const updated = { ...run, ...changes };
    this.runs.set(id, updated);
    return Promise.resolve({ ...updated });
  }

  findById(id: number): Promise<IngestionRun | null> {
    const run = this.runs.get(id);
    return Promise.resolve(run ? { ...run } : null);
  }

  findLatest(): Promise<IngestionRun | null> {
    const ids = [...this.runs.keys()];
    return this.findById(Math.max(...ids, 0));
  }

  failInterruptedRuns(message: string): Promise<number> {
    let count = 0;
    for (const run of this.runs.values()) {
      if (run.status === IngestionStatus.RUNNING) {
        run.status = IngestionStatus.FAILED;
        run.errorMessage = message;
        run.finishedAt = new Date();
        count++;
      }
    }
    return Promise.resolve(count);
  }
}
