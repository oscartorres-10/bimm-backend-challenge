import { GraphQLError } from 'graphql';
import {
  InMemoryIngestionRunRepository,
  InMemoryVehicleCatalogRepository,
} from '../../../../test/helpers/in-memory-repositories';
import { createTestConfig } from '../../../../test/helpers/test-doubles';
import { CatalogQueryService } from '../../application/catalog-query.service';
import type { IngestionService } from '../../application/ingestion.service';
import { IngestionTrigger } from '../../domain/vehicle-catalog.model';
import { IngestionResolver } from './ingestion.resolver';
import { MakesResolver } from './makes.resolver';
import { VehicleTypesLoaderFactory } from './vehicle-types.loader';
import { jest } from '../../../../test/helpers/jest';

async function seededCatalog() {
  const catalog = new InMemoryVehicleCatalogRepository();
  await catalog.saveBatch({
    entries: [
      {
        makeId: 440,
        makeName: 'ASTON MARTIN',
        vehicleTypes: [{ typeId: 2, typeName: 'Passenger Car' }],
      },
      {
        makeId: 474,
        makeName: 'HONDA',
        vehicleTypes: [{ typeId: 3, typeName: 'Truck' }],
      },
    ],
    makesWithoutTypeData: [],
  });
  return catalog;
}

describe('VehicleTypesLoaderFactory', () => {
  it('batches all lookups of one request into a single repository call', async () => {
    const catalog = await seededCatalog();
    const spy = jest.spyOn(catalog, 'findVehicleTypesByMakeIds');
    const factory = new VehicleTypesLoaderFactory(catalog);
    const requestContext = {};

    const [a, b, missing] = await Promise.all([
      factory.forContext(requestContext).load(440),
      factory.forContext(requestContext).load(474),
      factory.forContext(requestContext).load(1),
    ]);

    expect(a).toEqual([{ typeId: 2, typeName: 'Passenger Car' }]);
    expect(b).toEqual([{ typeId: 3, typeName: 'Truck' }]);
    expect(missing).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith([440, 474, 1]);
  });

  it('uses a separate loader (and cache) per request', () => {
    const factory = new VehicleTypesLoaderFactory(
      new InMemoryVehicleCatalogRepository(),
    );
    const first = {};
    expect(factory.forContext(first)).toBe(factory.forContext(first));
    expect(factory.forContext(first)).not.toBe(factory.forContext({}));
  });
});

describe('MakesResolver', () => {
  async function setup() {
    const catalog = await seededCatalog();
    const queries = new CatalogQueryService(
      catalog,
      new InMemoryIngestionRunRepository(),
      createTestConfig(),
    );
    return new MakesResolver(queries, new VehicleTypesLoaderFactory(catalog));
  }

  it('returns a page of makes with paging information', async () => {
    const resolver = await setup();

    const page = await resolver.makes({
      filter: { nameContains: 'hon' },
      limit: 10,
    });

    expect(page).toEqual({
      items: [
        {
          makeId: 474,
          makeName: 'HONDA',
          vehicleTypesSyncedAt: expect.any(Date),
        },
      ],
      totalCount: 1,
      offset: 0,
      limit: 10,
      hasNextPage: false,
    });
  });

  it('finds one make or returns null', async () => {
    const resolver = await setup();
    expect((await resolver.make(440))?.makeName).toBe('ASTON MARTIN');
    expect(await resolver.make(1)).toBeNull();
  });

  it('resolves vehicle types for a make', async () => {
    const resolver = await setup();
    await expect(
      resolver.makeVehicleTypes(
        { makeId: 440, makeName: 'ASTON MARTIN', vehicleTypesSyncedAt: null },
        {},
      ),
    ).resolves.toEqual([{ typeId: 2, typeName: 'Passenger Car' }]);
    await expect(resolver.vehicleTypes()).resolves.toHaveLength(2);
  });
});

describe('IngestionResolver', () => {
  function setup(overrides: Record<string, string> = {}) {
    const runs = new InMemoryIngestionRunRepository();
    const ingestion = {
      start: jest.fn().mockResolvedValue({ id: 1, status: 'RUNNING' }),
      runToCompletion: jest
        .fn()
        .mockResolvedValue({ id: 1, status: 'SUCCEEDED' }),
    };
    const config = createTestConfig(overrides);
    const resolver = new IngestionResolver(
      ingestion as unknown as IngestionService,
      new CatalogQueryService(
        new InMemoryVehicleCatalogRepository(),
        runs,
        config,
      ),
      config,
    );
    return { resolver, ingestion, runs };
  }

  it('starts a run in the background by default', async () => {
    const { resolver, ingestion } = setup();
    await expect(resolver.startIngestion(false)).resolves.toMatchObject({
      status: 'RUNNING',
    });
    expect(ingestion.start).toHaveBeenCalledWith(IngestionTrigger.MANUAL);
  });

  it('can wait for the run to complete', async () => {
    const { resolver, ingestion } = setup();
    await expect(resolver.startIngestion(true)).resolves.toMatchObject({
      status: 'SUCCEEDED',
    });
    expect(ingestion.runToCompletion).toHaveBeenCalledWith(
      IngestionTrigger.MANUAL,
    );
  });

  it('refuses with FORBIDDEN when the mutation is disabled', async () => {
    const { resolver } = setup({ FEATURE_INGESTION_MUTATION: 'false' });
    const error = await resolver.startIngestion(false).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GraphQLError);
    expect((error as GraphQLError).extensions.code).toBe('FORBIDDEN');
  });

  it('exposes run status queries', async () => {
    const { resolver, runs } = setup();
    expect(await resolver.latestIngestionRun()).toBeNull();
    const run = await runs.create(IngestionTrigger.STARTUP);
    expect((await resolver.latestIngestionRun())?.id).toBe(run.id);
    expect((await resolver.ingestionRun(run.id))?.id).toBe(run.id);
  });
});
