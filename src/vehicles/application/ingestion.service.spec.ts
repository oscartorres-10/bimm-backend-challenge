import {
  ExternalApiError,
  IngestionAlreadyRunningError,
  PersistenceError,
} from '../../common/errors/app-errors';
import {
  ALL_MAKES_XML,
  VEHICLE_TYPES_XML_BY_MAKE_ID,
} from '../../../test/fixtures';
import {
  InMemoryIngestionRunRepository,
  InMemoryVehicleCatalogRepository,
} from '../../../test/helpers/in-memory-repositories';
import {
  createMockLogger,
  createTestConfig,
} from '../../../test/helpers/test-doubles';
import {
  IngestionStatus,
  IngestionTrigger,
} from '../domain/vehicle-catalog.model';
import type { VpicClient } from '../infrastructure/vpic/vpic.client';
import { finalStatus, IngestionService } from './ingestion.service';
import { jest } from '../../../test/helpers/jest';

/** A mocked VpicClient that serves the XML fixtures by default. */
function createVpicMock() {
  return {
    fetchAllMakesXml: jest.fn((_signal?: AbortSignal) =>
      Promise.resolve(ALL_MAKES_XML),
    ),
    fetchVehicleTypesXml: jest.fn((makeId: number, _signal?: AbortSignal) =>
      Promise.resolve(VEHICLE_TYPES_XML_BY_MAKE_ID[makeId]),
    ),
  };
}

function setup(configOverrides: Record<string, string> = {}) {
  const vpic = createVpicMock();
  const catalog = new InMemoryVehicleCatalogRepository();
  const runs = new InMemoryIngestionRunRepository();
  const logger = createMockLogger();
  const service = new IngestionService(
    vpic as unknown as VpicClient,
    catalog,
    runs,
    createTestConfig({ INGESTION_BATCH_SIZE: '2', ...configOverrides }),
    logger,
  );
  return { service, vpic, catalog, runs, logger };
}

const notFound = (url: string) =>
  new ExternalApiError('vPIC responded with HTTP 404', false, {
    url,
    status: 404,
  });

describe('IngestionService', () => {
  it('ingests every make with its vehicle types in the unified shape', async () => {
    const { service, catalog } = setup();

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);

    expect(run).toMatchObject({
      status: IngestionStatus.SUCCEEDED,
      totalMakes: 4,
      processedMakes: 4,
      failedMakes: 0,
      rejectedRecords: 0,
      errorMessage: null,
    });
    expect(run.finishedAt).toBeInstanceOf(Date);
    expect(catalog.catalog()).toEqual([
      { makeId: 9999, makeName: '4M FARM & TRAILER SALES', vehicleTypes: [] },
      {
        makeId: 440,
        makeName: 'ASTON MARTIN',
        vehicleTypes: [
          { typeId: 2, typeName: 'Passenger Car' },
          { typeId: 7, typeName: 'Multipurpose Passenger Vehicle (MPV)' },
        ],
      },
      {
        makeId: 474,
        makeName: 'HONDA',
        vehicleTypes: [
          { typeId: 1, typeName: 'Motorcycle' },
          { typeId: 2, typeName: 'Passenger Car' },
          { typeId: 3, typeName: 'Truck' },
          { typeId: 7, typeName: 'Multipurpose Passenger Vehicle (MPV)' },
        ],
      },
      {
        makeId: 448,
        makeName: 'TOYOTA',
        vehicleTypes: [
          { typeId: 2, typeName: 'Passenger Car' },
          { typeId: 3, typeName: 'Truck' },
          { typeId: 7, typeName: 'Multipurpose Passenger Vehicle (MPV)' },
        ],
      },
    ]);
  });

  it('saves in batches of INGESTION_BATCH_SIZE', async () => {
    const { service, catalog, logger } = setup({ INGESTION_BATCH_SIZE: '3' });

    await service.runToCompletion(IngestionTrigger.MANUAL);

    expect(catalog.batches.map((batch) => batch.entries.length)).toEqual([
      3, 1,
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ batch: 2, batches: 2 }),
      'Ingestion batch saved',
    );
  });

  it('respects INGESTION_MAKE_LIMIT', async () => {
    const { service, vpic, catalog } = setup({ INGESTION_MAKE_LIMIT: '2' });

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);

    expect(run.totalMakes).toBe(2);
    expect(vpic.fetchVehicleTypesXml).toHaveBeenCalledTimes(2);
    expect(catalog.makes.size).toBe(2);
  });

  it('never exceeds INGESTION_CONCURRENCY parallel requests', async () => {
    const { service, vpic } = setup({
      INGESTION_CONCURRENCY: '2',
      INGESTION_BATCH_SIZE: '10',
    });
    let inFlight = 0;
    let maxInFlight = 0;
    vpic.fetchVehicleTypesXml.mockImplementation(async (makeId: number) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return VEHICLE_TYPES_XML_BY_MAKE_ID[makeId];
    });

    await service.runToCompletion(IngestionTrigger.MANUAL);
    expect(maxInFlight).toBe(2);
  });

  it('keeps going when vehicle types fail for some makes (partial success)', async () => {
    const { service, vpic, catalog, logger } = setup();
    vpic.fetchVehicleTypesXml.mockImplementation((makeId: number) =>
      makeId === 474
        ? Promise.reject(notFound('types/474'))
        : Promise.resolve(VEHICLE_TYPES_XML_BY_MAKE_ID[makeId]),
    );

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);

    expect(run).toMatchObject({
      status: IngestionStatus.PARTIALLY_SUCCEEDED,
      processedMakes: 4,
      failedMakes: 1,
    });
    expect(run.errorMessage).toMatch(/1 of 4 makes/);
    // The make is still stored, flagged as "types never synced".
    expect(catalog.makes.get(474)?.vehicleTypesSyncedAt).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        makeId: 474,
        error: expect.objectContaining({ code: 'EXTERNAL_API_ERROR' }),
      }),
      expect.stringContaining('Could not load vehicle types'),
    );
  });

  it('treats invalid XML for one make as a per-make failure', async () => {
    const { service, vpic } = setup();
    vpic.fetchVehicleTypesXml.mockImplementation((makeId: number) =>
      Promise.resolve(
        makeId === 440 ? '<html>oops' : VEHICLE_TYPES_XML_BY_MAKE_ID[makeId],
      ),
    );

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);
    expect(run).toMatchObject({
      status: IngestionStatus.PARTIALLY_SUCCEEDED,
      failedMakes: 1,
    });
  });

  it('fails the run when every make fails', async () => {
    const { service, vpic } = setup();
    vpic.fetchVehicleTypesXml.mockRejectedValue(notFound('types'));

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);
    expect(run.status).toBe(IngestionStatus.FAILED);
  });

  it('fails the run (without touching stored data) when the makes list cannot be downloaded', async () => {
    const { service, vpic, catalog, logger } = setup();
    vpic.fetchAllMakesXml.mockRejectedValue(
      new ExternalApiError('vPIC request timed out', true, { url: 'makes' }),
    );

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);

    expect(run.status).toBe(IngestionStatus.FAILED);
    expect(run.errorMessage).toBe('EXTERNAL_API_ERROR: vPIC request timed out');
    expect(catalog.batches).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ runId: run.id }),
      'Ingestion failed',
    );
  });

  it('fails the run when the makes XML is malformed', async () => {
    const { service, vpic } = setup();
    vpic.fetchAllMakesXml.mockResolvedValue('<Response><Results>');

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);
    expect(run.errorMessage).toMatch(/^XML_PARSE_ERROR/);
  });

  it('fails the run when the makes response has an unexpected structure', async () => {
    const { service, vpic } = setup();
    vpic.fetchAllMakesXml.mockResolvedValue('<Other><Thing>1</Thing></Other>');

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);
    expect(run.errorMessage).toMatch(/^TRANSFORMATION_ERROR/);
  });

  it('counts and logs malformed records without failing', async () => {
    const { service, vpic, logger } = setup();
    vpic.fetchAllMakesXml.mockResolvedValue(
      '<Response><Results>' +
        '<AllVehicleMakes><Make_ID>440</Make_ID><Make_Name>ASTON MARTIN</Make_Name></AllVehicleMakes>' +
        '<AllVehicleMakes><Make_ID>oops</Make_ID><Make_Name>BROKEN</Make_Name></AllVehicleMakes>' +
        '</Results></Response>',
    );

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);

    expect(run).toMatchObject({
      status: IngestionStatus.SUCCEEDED,
      totalMakes: 1,
      rejectedRecords: 1,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'getallmakes', rejectedCount: 1 }),
      'Transformation skipped malformed records',
    );
  });

  it('fails the run when saving to the database fails', async () => {
    const { service, catalog } = setup();
    jest
      .spyOn(catalog, 'saveBatch')
      .mockRejectedValue(new PersistenceError('database is locked'));

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);
    expect(run.status).toBe(IngestionStatus.FAILED);
    expect(run.errorMessage).toBe('PERSISTENCE_ERROR: database is locked');
  });

  it('logs unexpected errors with their stack trace', async () => {
    const { service, catalog, logger } = setup();
    const bug = new TypeError('cannot read properties of undefined');
    jest.spyOn(catalog, 'saveBatch').mockRejectedValue(bug);

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);

    expect(run.errorMessage).toMatch(/^UNEXPECTED_ERROR/);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: bug }),
      'Ingestion failed unexpectedly',
    );
  });

  it('still returns a failed run if recording the failure also fails', async () => {
    const { service, vpic, runs, logger } = setup();
    vpic.fetchAllMakesXml.mockRejectedValue(new Error('network down'));
    const update = jest.spyOn(runs, 'update');
    update.mockRejectedValue(new PersistenceError('db gone'));

    const run = await service.runToCompletion(IngestionTrigger.MANUAL);

    expect(run.status).toBe(IngestionStatus.FAILED);
    expect(logger.error).toHaveBeenCalledWith(
      expect.anything(),
      'Could not record the ingestion failure in the database',
    );
  });

  it('refuses to start a second run while one is in progress', async () => {
    const { service } = setup();

    const first = service.runToCompletion(IngestionTrigger.MANUAL);
    // The first call has already claimed the slot synchronously.
    await expect(service.start(IngestionTrigger.MANUAL)).rejects.toBeInstanceOf(
      IngestionAlreadyRunningError,
    );
    await first;

    // Once finished, a new run can start.
    expect(service.activeRunId).toBeNull();
    await expect(service.start(IngestionTrigger.MANUAL)).resolves.toMatchObject(
      {
        id: 2,
      },
    );
  });

  it('reports the active run id while running', async () => {
    const { service, vpic } = setup();
    let release!: () => void;
    vpic.fetchAllMakesXml.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(ALL_MAKES_XML);
        }),
    );

    const run = await service.start(IngestionTrigger.MANUAL);
    expect(run.status).toBe(IngestionStatus.RUNNING);
    expect(service.activeRunId).toBe(run.id);
    await expect(service.start(IngestionTrigger.MANUAL)).rejects.toThrow(
      `Ingestion run ${run.id} is already in progress`,
    );

    release();
    await service.beforeApplicationShutdown();
  });

  it('releases the slot if the run cannot even be registered', async () => {
    const { service, runs } = setup();
    jest
      .spyOn(runs, 'create')
      .mockRejectedValueOnce(new PersistenceError('db down'));

    await expect(service.start(IngestionTrigger.MANUAL)).rejects.toThrow(
      'db down',
    );
    expect(service.activeRunId).toBeNull();
  });

  it('cancels the run on shutdown and records why', async () => {
    const { service, vpic, runs } = setup();
    vpic.fetchVehicleTypesXml.mockImplementation(
      (_makeId: number, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new ExternalApiError('cancelled', false, { url: 'x' })),
          );
        }),
    );

    const run = await service.start(IngestionTrigger.MANUAL);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await service.beforeApplicationShutdown('SIGTERM');

    const stored = await runs.findById(run.id);
    expect(stored?.status).toBe(IngestionStatus.FAILED);
    expect(stored?.errorMessage).toMatch(/shutting down/);
  });

  it('does nothing on shutdown when idle', async () => {
    const { service } = setup();
    await expect(service.beforeApplicationShutdown()).resolves.toBeUndefined();
  });
});

describe('finalStatus', () => {
  it.each([
    [10, 0, IngestionStatus.SUCCEEDED],
    [0, 0, IngestionStatus.SUCCEEDED],
    [10, 3, IngestionStatus.PARTIALLY_SUCCEEDED],
    [10, 10, IngestionStatus.FAILED],
  ])('%i makes, %i failed → %s', (total, failed, expected) => {
    expect(finalStatus(total, failed)).toBe(expected);
  });
});
