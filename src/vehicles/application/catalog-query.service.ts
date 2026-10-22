import { Injectable } from '@nestjs/common';
import { InvalidInputError } from '../../common/errors/app-errors';
import { AppConfigService } from '../../config/app-config.service';
import type {
  IngestionRun,
  VehicleType,
} from '../domain/vehicle-catalog.model';
import {
  IngestionRunRepository,
  type Page,
  type StoredMake,
  VehicleCatalogRepository,
} from '../domain/vehicle-catalog.repository';

/** Input for listing makes, as received from a client. */
export interface ListMakesInput {
  nameContains?: string | null;
  vehicleTypeId?: number | null;
  offset?: number | null;
  limit?: number | null;
}

/** A page of makes plus the paging values that were applied. */
export interface MakesPage extends Page<StoredMake> {
  offset: number;
  limit: number;
  hasNextPage: boolean;
}

/** Page size used when the client does not ask for one. */
export const DEFAULT_PAGE_SIZE = 50;

@Injectable()
export class CatalogQueryService {
  constructor(
    private readonly catalog: VehicleCatalogRepository,
    private readonly runs: IngestionRunRepository,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Lists makes ordered by name. The result also contains the offset and
   * limit that were actually applied (after defaults).
   * @throws InvalidInputError for a negative offset or a limit outside 1..max.
   */
  async listMakes(input: ListMakesInput = {}): Promise<MakesPage> {
    const maxPageSize = this.config.graphql.maxPageSize;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? Math.min(DEFAULT_PAGE_SIZE, maxPageSize);

    if (offset < 0) {
      throw new InvalidInputError('offset must be zero or greater', {
        details: { offset },
      });
    }
    if (limit < 1 || limit > maxPageSize) {
      throw new InvalidInputError(
        `limit must be between 1 and ${maxPageSize}`,
        { details: { limit, maxPageSize } },
      );
    }

    const nameContains = input.nameContains?.trim();
    const page = await this.catalog.findMakes({
      nameContains: nameContains ? nameContains : undefined,
      vehicleTypeId: input.vehicleTypeId ?? undefined,
      offset,
      limit,
    });
    return {
      ...page,
      offset,
      limit,
      hasNextPage: offset + page.items.length < page.totalCount,
    };
  }

  getMake(makeId: number): Promise<StoredMake | null> {
    return this.catalog.findMakeById(makeId);
  }

  listVehicleTypes(): Promise<VehicleType[]> {
    return this.catalog.findAllVehicleTypes();
  }

  getIngestionRun(id: number): Promise<IngestionRun | null> {
    return this.runs.findById(id);
  }

  getLatestIngestionRun(): Promise<IngestionRun | null> {
    return this.runs.findLatest();
  }
}
