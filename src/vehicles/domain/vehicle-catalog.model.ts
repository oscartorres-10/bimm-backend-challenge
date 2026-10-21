/**
 * Domain model: the core "things" this service is about.
 *
 * "Domain" code describes the business concepts and rules and knows nothing
 * about HTTP, XML libraries, databases or GraphQL. Keeping it pure makes it
 * easy to understand and to test, and lets us swap infrastructure (e.g.
 * SQLite → PostgreSQL) without touching it.
 */

/** A vehicle manufacturer / brand, e.g. { makeId: 440, makeName: "ASTON MARTIN" }. */
export interface Make {
  makeId: number;
  makeName: string;
}

/** A category of vehicle, e.g. { typeId: 2, typeName: "Passenger Car" }. */
export interface VehicleType {
  typeId: number;
  typeName: string;
}

/**
 * One element of the final, unified JSON document. This is exactly the shape
 * requested by the challenge (in the gist from the instructions):
 *
 *   { "makeId": 440, "makeName": "ASTON MARTIN",
 *     "vehicleTypes": [ { "typeId": 2, "typeName": "Passenger Car" } ] }
 */
export interface CatalogEntry extends Make {
  vehicleTypes: VehicleType[];
}

/** Lifecycle of an ingestion run. */
export enum IngestionStatus {
  /** Currently working. */
  RUNNING = 'RUNNING',
  /** Every make and its vehicle types were stored. */
  SUCCEEDED = 'SUCCEEDED',
  /** Finished, but vehicle types could not be fetched for some makes. */
  PARTIALLY_SUCCEEDED = 'PARTIALLY_SUCCEEDED',
  /** Stopped because of an error (see `errorMessage`). */
  FAILED = 'FAILED',
}

/** What started an ingestion run. */
export enum IngestionTrigger {
  STARTUP = 'STARTUP',
  MANUAL = 'MANUAL',
}

/**
 * A record of one execution of the ingestion pipeline, so operators (and
 * API clients) can see when data was last refreshed and whether it worked.
 */
export interface IngestionRun {
  id: number;
  status: IngestionStatus;
  trigger: IngestionTrigger;
  startedAt: Date;
  finishedAt: Date | null;
  /** How many makes this run intends to process. */
  totalMakes: number;
  /** Makes saved so far (with or without vehicle types). */
  processedMakes: number;
  /** Makes whose vehicle types could not be fetched. */
  failedMakes: number;
  /** Records skipped because they were malformed. */
  rejectedRecords: number;
  errorMessage: string | null;
}
