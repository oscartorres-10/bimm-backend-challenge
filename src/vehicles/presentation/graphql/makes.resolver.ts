import {
  Args,
  Context,
  Int,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { CatalogQueryService } from '../../application/catalog-query.service';
import type { StoredMake } from '../../domain/vehicle-catalog.repository';
import {
  MakeModel,
  MakePageModel,
  MakesArgs,
  VehicleTypeModel,
} from './catalog.models';
import { VehicleTypesLoaderFactory } from './vehicle-types.loader';

/** Converts a stored make into the GraphQL type (vehicleTypes resolved lazily). */
function toMakeModel(make: StoredMake): MakeModel {
  return {
    makeId: make.makeId,
    makeName: make.makeName,
    vehicleTypesSyncedAt: make.vehicleTypesSyncedAt,
  };
}

@Resolver(() => MakeModel)
export class MakesResolver {
  constructor(
    private readonly queries: CatalogQueryService,
    private readonly loaders: VehicleTypesLoaderFactory,
  ) {}

  @Query(() => MakePageModel, {
    description:
      'Lists makes with their vehicle types, ordered by name. ' +
      'Supports filtering and offset/limit pagination.',
  })
  async makes(@Args() args: MakesArgs): Promise<MakePageModel> {
    const page = await this.queries.listMakes({
      nameContains: args.filter?.nameContains,
      vehicleTypeId: args.filter?.vehicleTypeId,
      offset: args.offset,
      limit: args.limit,
    });
    return { ...page, items: page.items.map(toMakeModel) };
  }

  @Query(() => MakeModel, {
    nullable: true,
    description: 'Returns one make by its vPIC Make_ID, or null if unknown.',
  })
  async make(
    @Args('makeId', { type: () => Int, description: 'vPIC Make_ID, e.g. 440.' })
    makeId: number,
  ): Promise<MakeModel | null> {
    const make = await this.queries.getMake(makeId);
    return make ? toMakeModel(make) : null;
  }

  @Query(() => [VehicleTypeModel], {
    description: 'Every known vehicle type, ordered by typeId.',
  })
  vehicleTypes(): Promise<VehicleTypeModel[]> {
    return this.queries.listVehicleTypes();
  }

  /** Batched through DataLoader: one database query per request, not per make. */
  @ResolveField('vehicleTypes', () => [VehicleTypeModel])
  makeVehicleTypes(
    @Parent() make: MakeModel,
    @Context() context: object,
  ): Promise<VehicleTypeModel[]> {
    return this.loaders.forContext(context).load(make.makeId);
  }
}
