import {
  ArgsType,
  Field,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  IngestionStatus,
  IngestionTrigger,
} from '../../domain/vehicle-catalog.model';

// Make the domain enums available as GraphQL enums.
registerEnumType(IngestionStatus, {
  name: 'IngestionStatus',
  description: 'Lifecycle state of an ingestion run.',
  valuesMap: {
    RUNNING: { description: 'The run is currently in progress.' },
    SUCCEEDED: { description: 'Every make and its vehicle types were stored.' },
    PARTIALLY_SUCCEEDED: {
      description:
        'Finished, but vehicle types could not be fetched for some makes.',
    },
    FAILED: { description: 'The run stopped because of an error.' },
  },
});

registerEnumType(IngestionTrigger, {
  name: 'IngestionTrigger',
  description: 'What started an ingestion run.',
  valuesMap: {
    STARTUP: { description: 'Started automatically when the service booted.' },
    MANUAL: { description: 'Started through the startIngestion mutation.' },
  },
});

@ObjectType('VehicleType', {
  description: 'A category of vehicle, e.g. "Passenger Car" or "Truck".',
})
export class VehicleTypeModel {
  @Field(() => Int, { description: 'vPIC VehicleTypeId.' })
  typeId: number;

  @Field({ description: 'vPIC VehicleTypeName.' })
  typeName: string;
}

@ObjectType('Make', {
  description:
    'A vehicle manufacturer with the vehicle types it produces. ' +
    'This is the unified shape combining both vPIC endpoints.',
})
export class MakeModel {
  @Field(() => Int, { description: 'vPIC Make_ID.' })
  makeId: number;

  @Field({ description: 'vPIC Make_Name.' })
  makeName: string;

  /** Resolved separately (and in batches) by `MakesResolver.vehicleTypes`. */
  @Field(() => [VehicleTypeModel], {
    description: 'Vehicle types produced by this make, ordered by typeId.',
  })
  vehicleTypes?: VehicleTypeModel[];

  @Field(() => Date, {
    nullable: true,
    description:
      'When vehicleTypes was last refreshed from vPIC. Null means the vehicle types have never been fetched successfully.',
  })
  vehicleTypesSyncedAt: Date | null;
}

@ObjectType('MakePage', { description: 'One page of makes.' })
export class MakePageModel {
  @Field(() => [MakeModel], { description: 'The makes on this page.' })
  items: MakeModel[];

  @Field(() => Int, {
    description: 'Total number of makes matching the filter.',
  })
  totalCount: number;

  @Field(() => Int, { description: 'Offset used for this page.' })
  offset: number;

  @Field(() => Int, { description: 'Page size used for this page.' })
  limit: number;

  @Field({ description: 'True when more makes exist after this page.' })
  hasNextPage: boolean;
}

@ObjectType('IngestionRun', {
  description: 'One execution of the XML → JSON → database ingestion pipeline.',
})
export class IngestionRunModel {
  @Field(() => Int, { description: 'Unique, increasing run number.' })
  id: number;

  @Field(() => IngestionStatus, { description: 'Current state of the run.' })
  status: IngestionStatus;

  @Field(() => IngestionTrigger, { description: 'What started the run.' })
  trigger: IngestionTrigger;

  @Field(() => Date, { description: 'When the run started.' })
  startedAt: Date;

  @Field(() => Date, { nullable: true, description: 'Null while running.' })
  finishedAt: Date | null;

  @Field(() => Int, { description: 'Makes this run intends to process.' })
  totalMakes: number;

  @Field(() => Int, { description: 'Makes stored so far.' })
  processedMakes: number;

  @Field(() => Int, {
    description: 'Makes whose vehicle types could not be fetched.',
  })
  failedMakes: number;

  @Field(() => Int, {
    description: 'Source records skipped because they were malformed.',
  })
  rejectedRecords: number;

  @Field(() => String, {
    nullable: true,
    description: 'Why the run failed or was partial.',
  })
  errorMessage: string | null;
}

@InputType('MakesFilter', {
  description: 'Optional filters for the makes query.',
})
export class MakesFilterInput {
  @Field(() => String, {
    nullable: true,
    description: 'Case-insensitive substring of the make name, e.g. "toyo".',
  })
  nameContains?: string | null;

  @Field(() => Int, {
    nullable: true,
    description:
      'Only makes that produce this vehicle type (see vehicleTypes query).',
  })
  vehicleTypeId?: number | null;
}

/** Arguments of the `makes` query. */
@ArgsType()
export class MakesArgs {
  @Field(() => MakesFilterInput, {
    nullable: true,
    description: 'Optional filters; all given filters must match.',
  })
  filter?: MakesFilterInput | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Number of makes to skip. Default 0.',
  })
  offset?: number | null;

  @Field(() => Int, {
    nullable: true,
    description:
      'Page size. Default 50, maximum GRAPHQL_MAX_PAGE_SIZE (1000 by default).',
  })
  limit?: number | null;
}
