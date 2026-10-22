import { Module } from '@nestjs/common';
import { CatalogQueryService } from './application/catalog-query.service';
import { IngestionStartupService } from './application/ingestion-startup.service';
import { IngestionService } from './application/ingestion.service';
import {
  IngestionRunRepository,
  VehicleCatalogRepository,
} from './domain/vehicle-catalog.repository';
import { TypeOrmIngestionRunRepository } from './infrastructure/persistence/typeorm-ingestion-run.repository';
import { TypeOrmVehicleCatalogRepository } from './infrastructure/persistence/typeorm-vehicle-catalog.repository';
import { FETCH, VpicClient } from './infrastructure/vpic/vpic.client';
import { IngestionResolver } from './presentation/graphql/ingestion.resolver';
import { MakesResolver } from './presentation/graphql/makes.resolver';
import { VehicleTypesLoaderFactory } from './presentation/graphql/vehicle-types.loader';
import { HealthController } from './presentation/http/health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    // Infrastructure
    {
      provide: FETCH,
      useValue: (...args: Parameters<typeof fetch>) => fetch(...args),
    },
    VpicClient,
    {
      provide: VehicleCatalogRepository,
      useClass: TypeOrmVehicleCatalogRepository,
    },
    {
      provide: IngestionRunRepository,
      useClass: TypeOrmIngestionRunRepository,
    },
    // Application
    IngestionService,
    IngestionStartupService,
    CatalogQueryService,
    // Presentation
    VehicleTypesLoaderFactory,
    MakesResolver,
    IngestionResolver,
  ],
})
export class VehiclesModule {}
