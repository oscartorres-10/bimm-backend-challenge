/** Unit tests for input validation and defaults on the read side. */
import { InvalidInputError } from '../../common/errors/app-errors';
import {
  InMemoryIngestionRunRepository,
  InMemoryVehicleCatalogRepository,
} from '../../../test/helpers/in-memory-repositories';
import { createTestConfig } from '../../../test/helpers/test-doubles';
import { IngestionTrigger } from '../domain/vehicle-catalog.model';
import {
  CatalogQueryService,
  DEFAULT_PAGE_SIZE,
} from './catalog-query.service';
import { jest } from '../../../test/helpers/jest';

function setup(overrides: Record<string, string> = {}) {
  const catalog = new InMemoryVehicleCatalogRepository();
  const runs = new InMemoryIngestionRunRepository();
  const service = new CatalogQueryService(
    catalog,
    runs,
    createTestConfig({ GRAPHQL_MAX_PAGE_SIZE: '100', ...overrides }),
  );
  return { service, catalog, runs };
}

describe('CatalogQueryService', () => {
  it('uses offset 0 and the default page size when none is given', async () => {
    const { service, catalog } = setup();
    const findMakes = jest.spyOn(catalog, 'findMakes');

    await service.listMakes();

    expect(findMakes).toHaveBeenCalledWith({
      nameContains: undefined,
      vehicleTypeId: undefined,
      offset: 0,
      limit: DEFAULT_PAGE_SIZE,
    });
  });

  it('caps the default page size at the configured maximum', async () => {
    const { service, catalog } = setup({ GRAPHQL_MAX_PAGE_SIZE: '10' });
    const findMakes = jest.spyOn(catalog, 'findMakes');

    await service.listMakes({});
    expect(findMakes).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('trims the name filter and ignores a blank one', async () => {
    const { service, catalog } = setup();
    const findMakes = jest.spyOn(catalog, 'findMakes');

    await service.listMakes({ nameContains: '  honda ', vehicleTypeId: 2 });
    await service.listMakes({ nameContains: '   ' });

    expect(findMakes).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ nameContains: 'honda', vehicleTypeId: 2 }),
    );
    expect(findMakes).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ nameContains: undefined }),
    );
  });

  it.each([
    [{ offset: -1 }, /offset/],
    [{ limit: 0 }, /limit must be between 1 and 100/],
    [{ limit: 101 }, /limit must be between 1 and 100/],
  ])('rejects invalid paging %o', async (input, message) => {
    const { service } = setup();
    await expect(service.listMakes(input)).rejects.toThrow(InvalidInputError);
    await expect(service.listMakes(input)).rejects.toThrow(message);
  });

  it('returns the applied paging values and whether more pages exist', async () => {
    const { service, catalog } = setup();
    await catalog.saveBatch({
      entries: [1, 2, 3].map((id) => ({
        makeId: id,
        makeName: `MAKE ${id}`,
        vehicleTypes: [],
      })),
      makesWithoutTypeData: [],
    });

    const first = await service.listMakes({ limit: 2 });
    expect(first).toMatchObject({
      offset: 0,
      limit: 2,
      totalCount: 3,
      hasNextPage: true,
    });
    const last = await service.listMakes({ offset: 2, limit: 2 });
    expect(last).toMatchObject({ offset: 2, hasNextPage: false });
    expect(last.items.map((make) => make.makeId)).toEqual([3]);
  });

  it('delegates single lookups to the repositories', async () => {
    const { service, catalog, runs } = setup();
    await catalog.saveBatch({
      entries: [
        {
          makeId: 1,
          makeName: 'A',
          vehicleTypes: [{ typeId: 3, typeName: 'Truck' }],
        },
      ],
      makesWithoutTypeData: [],
    });
    const run = await runs.create(IngestionTrigger.MANUAL);

    expect((await service.getMake(1))?.makeName).toBe('A');
    expect(await service.getMake(2)).toBeNull();
    expect(await service.listVehicleTypes()).toEqual([
      { typeId: 3, typeName: 'Truck' },
    ]);
    expect((await service.getIngestionRun(run.id))?.id).toBe(run.id);
    expect((await service.getLatestIngestionRun())?.id).toBe(run.id);
  });
});
