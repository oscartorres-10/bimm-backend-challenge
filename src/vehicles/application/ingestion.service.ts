import { BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  AppError,
  describeError,
  IngestionAlreadyRunningError,
} from '../../common/errors/app-errors';
import { chunk, mapWithConcurrency } from '../../common/utils/concurrency';
import { AppConfigService } from '../../config/app-config.service';
import { combineCatalog } from '../domain/transformers/catalog.combiner';
import {
  MAKE_ITEM_TAG,
  transformMakes,
} from '../domain/transformers/makes.transformer';
import {
  transformVehicleTypes,
  VEHICLE_TYPE_ITEM_TAG,
} from '../domain/transformers/vehicle-types.transformer';
import type { TransformResult } from '../domain/transformers/vpic-response';
import {
  type IngestionRun,
  IngestionStatus,
  IngestionTrigger,
  type Make,
  type VehicleType,
} from '../domain/vehicle-catalog.model';
import {
  IngestionRunRepository,
  VehicleCatalogRepository,
} from '../domain/vehicle-catalog.repository';
import { VpicClient } from '../infrastructure/vpic/vpic.client';
import { parseXml } from '../infrastructure/xml/xml-parser';

/** Bookkeeping for the run currently in progress. */
interface ActiveRun {
  runId: number | null;
  abort: AbortController;
  done: Promise<IngestionRun>;
}

@Injectable()
export class IngestionService implements BeforeApplicationShutdown {
  private active: ActiveRun | null = null;

  constructor(
    private readonly vpic: VpicClient,
    private readonly catalog: VehicleCatalogRepository,
    private readonly runs: IngestionRunRepository,
    private readonly config: AppConfigService,
    @InjectPinoLogger(IngestionService.name)
    private readonly logger: PinoLogger,
  ) {}

  /** Id of the run in progress, or null when idle. */
  get activeRunId(): number | null {
    return this.active?.runId ?? null;
  }

  /**
   * Starts a run in the background and returns immediately with the new run
   * record (status RUNNING). Poll `IngestionRunRepository` for progress.
   *
   * @throws IngestionAlreadyRunningError if a run is already in progress.
   */
  async start(trigger: IngestionTrigger): Promise<IngestionRun> {
    const { run } = await this.launch(trigger);
    return run;
  }

  /** Starts a run and waits until it has finished. */
  async runToCompletion(trigger: IngestionTrigger): Promise<IngestionRun> {
    const { done } = await this.launch(trigger);
    return done;
  }

  /**
   * Nest calls this when the app is stopping (e.g. Ctrl+C or `docker stop`),
   * BEFORE closing the database. We cancel the run and wait for it to record
   * its final state.
   */
  async beforeApplicationShutdown(signal?: string): Promise<void> {
    const active = this.active;
    if (!active) return;
    this.logger.warn(
      { runId: active.runId, signal },
      'Shutdown requested; cancelling the ingestion in progress',
    );
    active.abort.abort(new Error('the application is shutting down'));
    await active.done;
  }

  /** Registers a run and kicks off `execute` without waiting for it. */
  private async launch(
    trigger: IngestionTrigger,
  ): Promise<{ run: IngestionRun; done: Promise<IngestionRun> }> {
    if (this.active) {
      throw new IngestionAlreadyRunningError(this.active.runId);
    }
    // Claim the slot synchronously so two simultaneous calls can't both start.
    const active: ActiveRun = {
      runId: null,
      abort: new AbortController(),
      done: Promise.resolve(null as never),
    };
    this.active = active;

    let run: IngestionRun;
    try {
      run = await this.runs.create(trigger);
    } catch (error) {
      this.active = null;
      throw error;
    }

    active.runId = run.id;
    active.done = this.execute(run, active.abort.signal).finally(() => {
      this.active = null;
    });
    return { run, done: active.done };
  }

  /** The pipeline itself. Never throws: every outcome is recorded on the run. */
  private async execute(
    initialRun: IngestionRun,
    signal: AbortSignal,
  ): Promise<IngestionRun> {
    const runId = initialRun.id;
    const startedAt = Date.now();
    const { concurrency, batchSize, makeLimit } = this.config.ingestion;
    const log = this.logger;
    log.info(
      { runId, trigger: initialRun.trigger, concurrency, batchSize, makeLimit },
      'Ingestion started',
    );

    const counters = { processedMakes: 0, failedMakes: 0, rejectedRecords: 0 };

    try {
      // Steps 1–2: all makes.
      const makes = await this.loadMakes(runId, signal, counters);
      await this.runs.update(runId, { totalMakes: makes.length, ...counters });

      // Step 3: batches of makes with their vehicle types.
      const batches = chunk(makes, batchSize);
      for (const [index, batch] of batches.entries()) {
        throwIfAborted(signal);
        await this.processBatch(runId, batch, signal, counters);
        await this.runs.update(runId, counters);
        log.info(
          {
            runId,
            batch: index + 1,
            batches: batches.length,
            processedMakes: counters.processedMakes,
            totalMakes: makes.length,
          },
          'Ingestion batch saved',
        );
      }

      // Step 4: final status.
      const status = finalStatus(makes.length, counters.failedMakes);
      const finished = await this.runs.update(runId, {
        ...counters,
        status,
        finishedAt: new Date(),
        errorMessage:
          status === IngestionStatus.SUCCEEDED
            ? null
            : `Vehicle types could not be fetched for ${counters.failedMakes} of ${makes.length} makes`,
      });
      log.info(
        { runId, status, durationMs: Date.now() - startedAt, ...counters },
        'Ingestion finished',
      );
      return finished;
    } catch (error) {
      return this.recordFailure(initialRun, error, counters, startedAt);
    }
  }

  /** Downloads, parses and transforms the list of all makes. */
  private async loadMakes(
    runId: number,
    signal: AbortSignal,
    counters: { rejectedRecords: number },
  ): Promise<Make[]> {
    const xml = await this.vpic.fetchAllMakesXml(signal);
    const parsed = parseXml(xml, {
      arrayTags: [MAKE_ITEM_TAG],
      source: 'getallmakes',
    });
    const result = transformMakes(parsed);
    counters.rejectedRecords += result.rejected.length;
    this.logRejected(runId, 'getallmakes', result);

    const { makeLimit } = this.config.ingestion;
    const makes =
      makeLimit > 0 ? result.items.slice(0, makeLimit) : result.items;
    this.logger.info(
      {
        runId,
        receivedMakes: result.items.length,
        selectedMakes: makes.length,
        rejectedRecords: result.rejected.length,
      },
      'Makes downloaded and transformed',
    );
    return makes;
  }

  /** Fetches vehicle types for one batch of makes and saves the batch. */
  private async processBatch(
    runId: number,
    batch: Make[],
    signal: AbortSignal,
    counters: {
      processedMakes: number;
      failedMakes: number;
      rejectedRecords: number;
    },
  ): Promise<void> {
    const results = await mapWithConcurrency(
      batch,
      this.config.ingestion.concurrency,
      (make) => this.loadVehicleTypes(runId, make, signal),
    );
    throwIfAborted(signal);

    const typesByMakeId = new Map<number, VehicleType[]>();
    const makesWithoutTypeData: Make[] = [];
    results.forEach((result, index) => {
      const make = batch[index];
      if (result.status === 'fulfilled') {
        typesByMakeId.set(make.makeId, result.value.items);
        counters.rejectedRecords += result.value.rejected.length;
      } else {
        makesWithoutTypeData.push(make);
        counters.failedMakes++;
        this.logger.warn(
          { runId, makeId: make.makeId, error: describeError(result.reason) },
          'Could not load vehicle types for make; keeping previously stored types',
        );
      }
    });

    const entries = combineCatalog(
      batch.filter((make) => typesByMakeId.has(make.makeId)),
      typesByMakeId,
    );
    await this.catalog.saveBatch({ entries, makesWithoutTypeData });
    counters.processedMakes += batch.length;
  }

  /** Downloads, parses and transforms the vehicle types of one make. */
  private async loadVehicleTypes(
    runId: number,
    make: Make,
    signal: AbortSignal,
  ): Promise<TransformResult<VehicleType>> {
    const xml = await this.vpic.fetchVehicleTypesXml(make.makeId, signal);
    const source = `GetVehicleTypesForMakeId/${make.makeId}`;
    const parsed = parseXml(xml, {
      arrayTags: [VEHICLE_TYPE_ITEM_TAG],
      source,
    });
    const result = transformVehicleTypes(parsed, make.makeId);
    this.logRejected(runId, source, result);
    return result;
  }

  /** Logs skipped records (as a warning, with a sample to aid debugging). */
  private logRejected(
    runId: number,
    source: string,
    result: TransformResult<unknown>,
  ): void {
    if (result.rejected.length === 0) return;
    this.logger.warn(
      {
        runId,
        source,
        rejectedCount: result.rejected.length,
        sample: result.rejected.slice(0, 5),
      },
      'Transformation skipped malformed records',
    );
  }

  /** Logs a fatal pipeline error and stores it on the run. */
  private async recordFailure(
    run: IngestionRun,
    error: unknown,
    counters: {
      processedMakes: number;
      failedMakes: number;
      rejectedRecords: number;
    },
    startedAt: number,
  ): Promise<IngestionRun> {
    const description = describeError(error);
    const context = {
      runId: run.id,
      durationMs: Date.now() - startedAt,
      ...counters,
      error: description,
    };
    if (error instanceof AppError) {
      this.logger.error(context, 'Ingestion failed');
    } else {
      // Unknown errors are bugs: include the full stack trace.
      this.logger.error(
        { ...context, err: error },
        'Ingestion failed unexpectedly',
      );
    }

    const failure = {
      ...counters,
      status: IngestionStatus.FAILED,
      finishedAt: new Date(),
      errorMessage: `${description.code}: ${description.message}`,
    };
    try {
      return await this.runs.update(run.id, failure);
    } catch (updateError) {
      this.logger.error(
        { runId: run.id, err: updateError },
        'Could not record the ingestion failure in the database',
      );
      return { ...run, ...failure };
    }
  }
}

/** Throws the abort reason if the run was cancelled. */
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const reason: unknown = signal.reason;
    throw reason instanceof Error ? reason : new Error('Ingestion cancelled');
  }
}

/**
 * SUCCEEDED when nothing failed, FAILED when every make failed (the API is
 * probably down), PARTIALLY_SUCCEEDED otherwise.
 */
export function finalStatus(
  totalMakes: number,
  failedMakes: number,
): IngestionStatus {
  if (failedMakes === 0) return IngestionStatus.SUCCEEDED;
  if (failedMakes >= totalMakes) return IngestionStatus.FAILED;
  return IngestionStatus.PARTIALLY_SUCCEEDED;
}
