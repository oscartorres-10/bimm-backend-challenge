/**
 * Repository "ports": what the rest of the app needs from storage.
 *
 * A repository is an object that saves and loads domain data. Here we only
 * DESCRIBE the operations (as abstract classes); the actual database code
 * lives in `infrastructure/persistence`. The application layer depends on
 * these descriptions, never on TypeORM/SQL directly. That keeps business
 * logic independent of the database and lets unit tests use simple fakes.
 *
 * (Abstract classes are used instead of TypeScript interfaces because NestJS
 * needs something that still exists at runtime to use as an injection token.)
 */
import type {
  CatalogEntry,
  IngestionRun,
  IngestionTrigger,
  Make,
  VehicleType,
} from './vehicle-catalog.model';

/** A make as stored, with bookkeeping fields. */
export interface StoredMake extends Make {
  /** When its vehicle types were last refreshed; null = never fetched. */
  vehicleTypesSyncedAt: Date | null;
  /** When the make itself was last seen in an ingestion. */
  lastIngestedAt: Date;
}

/** Filtering and pagination options for listing makes. */
export interface FindMakesQuery {
  /** Case-insensitive "name contains" filter. */
  nameContains?: string;
  /** Only makes that have this vehicle type. */
  vehicleTypeId?: number;
  /** How many matching makes to skip (for paging). */
  offset: number;
  /** Maximum number of makes to return. */
  limit: number;
}

/** One page of results plus the total number of matches. */
export interface Page<T> {
  items: T[];
  totalCount: number;
}

/** A batch of ingestion output, saved atomically (all or nothing). */
export interface CatalogBatch {
  /** Makes whose vehicle types were fetched; their types are replaced. */
  entries: CatalogEntry[];
  /**
   * Makes whose vehicle types could NOT be fetched this time. The make is
   * saved/updated, but previously stored vehicle types are kept as they are
   * rather than wiped by a temporary network problem.
   */
  makesWithoutTypeData: Make[];
}

export abstract class VehicleCatalogRepository {
  /** Inserts or updates a batch inside a single database transaction. */
  abstract saveBatch(batch: CatalogBatch): Promise<void>;

  /** Lists makes ordered by name, filtered and paginated. */
  abstract findMakes(query: FindMakesQuery): Promise<Page<StoredMake>>;

  /** Returns one make or null if it does not exist. */
  abstract findMakeById(makeId: number): Promise<StoredMake | null>;

  /**
   * Loads vehicle types for many makes in ONE query. Every requested id is
   * present in the result (with an empty list if it has no types).
   */
  abstract findVehicleTypesByMakeIds(
    makeIds: readonly number[],
  ): Promise<Map<number, VehicleType[]>>;

  /** Every known vehicle type, ordered by id. */
  abstract findAllVehicleTypes(): Promise<VehicleType[]>;

  /** Total number of stored makes. */
  abstract countMakes(): Promise<number>;
}

/** Fields of an ingestion run that can change while it is running. */
export type IngestionRunUpdate = Partial<
  Omit<IngestionRun, 'id' | 'trigger' | 'startedAt'>
>;

export abstract class IngestionRunRepository {
  /** Records the start of a new run (status RUNNING). */
  abstract create(trigger: IngestionTrigger): Promise<IngestionRun>;

  /** Changes some fields of a run and returns the updated run. */
  abstract update(
    id: number,
    changes: IngestionRunUpdate,
  ): Promise<IngestionRun>;

  abstract findById(id: number): Promise<IngestionRun | null>;

  /** The most recently started run, or null if none ever ran. */
  abstract findLatest(): Promise<IngestionRun | null>;

  /**
   * Marks runs still flagged RUNNING as FAILED. Used on startup: if the
   * process crashed mid-run, that run would otherwise look "in progress"
   * forever. Returns how many runs were changed.
   */
  abstract failInterruptedRuns(message: string): Promise<number>;
}
