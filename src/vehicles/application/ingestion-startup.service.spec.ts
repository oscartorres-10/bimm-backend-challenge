/** Unit tests for what happens to ingestion when the service boots. */
import { IngestionAlreadyRunningError } from '../../common/errors/app-errors';
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
import {
  IngestionStartupService,
  INTERRUPTED_RUN_MESSAGE,
} from './ingestion-startup.service';
import type { IngestionService } from './ingestion.service';
import { jest } from '../../../test/helpers/jest';

function setup(overrides: Record<string, string>) {
  const ingestion = {
    start: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const catalog = new InMemoryVehicleCatalogRepository();
  const runs = new InMemoryIngestionRunRepository();
  const logger = createMockLogger();
  const service = new IngestionStartupService(
    ingestion as unknown as IngestionService,
    catalog,
    runs,
    createTestConfig(overrides),
    logger,
  );
  return { service, ingestion, catalog, runs, logger };
}

describe('IngestionStartupService', () => {
  it('marks runs interrupted by a previous crash as failed', async () => {
    const { service, runs, logger } = setup({
      FEATURE_INGESTION_ON_STARTUP: 'false',
    });
    const stale = await runs.create(IngestionTrigger.MANUAL);

    await service.onApplicationBootstrap();

    expect(await runs.findById(stale.id)).toMatchObject({
      status: IngestionStatus.FAILED,
      errorMessage: INTERRUPTED_RUN_MESSAGE,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { count: 1 },
      'Marked interrupted ingestion runs as failed',
    );
  });

  it('does not ingest when the feature flag is off', async () => {
    const { service, ingestion } = setup({
      FEATURE_INGESTION_ON_STARTUP: 'false',
    });
    await service.onApplicationBootstrap();
    expect(ingestion.start).not.toHaveBeenCalled();
  });

  it('starts an ingestion in the background when the database is empty', async () => {
    const { service, ingestion } = setup({
      FEATURE_INGESTION_ON_STARTUP: 'true',
    });
    await service.onApplicationBootstrap();
    expect(ingestion.start).toHaveBeenCalledWith(IngestionTrigger.STARTUP);
  });

  it('skips the startup ingestion when data already exists', async () => {
    const { service, ingestion, catalog } = setup({
      FEATURE_INGESTION_ON_STARTUP: 'true',
      FEATURE_INGESTION_SKIP_IF_POPULATED: 'true',
    });
    await catalog.saveBatch({
      entries: [{ makeId: 1, makeName: 'A', vehicleTypes: [] }],
      makesWithoutTypeData: [],
    });

    await service.onApplicationBootstrap();
    expect(ingestion.start).not.toHaveBeenCalled();
  });

  it('re-ingests on every startup when skipping is disabled', async () => {
    const { service, ingestion, catalog } = setup({
      FEATURE_INGESTION_ON_STARTUP: 'true',
      FEATURE_INGESTION_SKIP_IF_POPULATED: 'false',
    });
    await catalog.saveBatch({
      entries: [{ makeId: 1, makeName: 'A', vehicleTypes: [] }],
      makesWithoutTypeData: [],
    });

    await service.onApplicationBootstrap();
    expect(ingestion.start).toHaveBeenCalled();
  });

  it('never blocks startup if the ingestion cannot be launched', async () => {
    const { service, ingestion, logger } = setup({
      FEATURE_INGESTION_ON_STARTUP: 'true',
    });
    ingestion.start.mockRejectedValue(new IngestionAlreadyRunningError(3));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INGESTION_ALREADY_RUNNING' }),
      }),
      'Startup ingestion could not be launched',
    );
  });
});
