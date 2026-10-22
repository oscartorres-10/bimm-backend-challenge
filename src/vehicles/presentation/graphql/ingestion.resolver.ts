import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AppConfigService } from '../../../config/app-config.service';
import { CatalogQueryService } from '../../application/catalog-query.service';
import { IngestionService } from '../../application/ingestion.service';
import { IngestionTrigger } from '../../domain/vehicle-catalog.model';
import { IngestionRunModel } from './catalog.models';

@Resolver(() => IngestionRunModel)
export class IngestionResolver {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly queries: CatalogQueryService,
    private readonly config: AppConfigService,
  ) {}

  @Query(() => IngestionRunModel, {
    nullable: true,
    description:
      'The most recently started ingestion run, or null if none ever ran.',
  })
  latestIngestionRun(): Promise<IngestionRunModel | null> {
    return this.queries.getLatestIngestionRun();
  }

  @Query(() => IngestionRunModel, {
    nullable: true,
    description: 'One ingestion run by id, or null if unknown.',
  })
  ingestionRun(
    @Args('id', { type: () => Int, description: 'The ingestion run id.' })
    id: number,
  ): Promise<IngestionRunModel | null> {
    return this.queries.getIngestionRun(id);
  }

  @Mutation(() => IngestionRunModel, {
    description:
      'Downloads fresh data from vPIC and stores it. By default returns immediately ' +
      'with the RUNNING run (poll ingestionRun for progress). Fails with code ' +
      'CONFLICT if a run is already in progress, or FORBIDDEN if disabled by configuration.',
  })
  async startIngestion(
    @Args('waitForCompletion', {
      type: () => Boolean,
      defaultValue: false,
      description:
        'Wait for the run to finish before responding. Only sensible with INGESTION_MAKE_LIMIT set; a full run takes minutes.',
    })
    waitForCompletion: boolean,
  ): Promise<IngestionRunModel> {
    if (!this.config.ingestion.mutationEnabled) {
      throw new GraphQLError('The startIngestion mutation is disabled', {
        extensions: { code: 'FORBIDDEN' },
      });
    }
    return waitForCompletion
      ? this.ingestion.runToCompletion(IngestionTrigger.MANUAL)
      : this.ingestion.start(IngestionTrigger.MANUAL);
  }
}
