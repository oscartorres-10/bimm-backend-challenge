import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { describeError } from '../../common/errors/app-errors';
import { AppConfigService } from '../../config/app-config.service';
import { IngestionTrigger } from '../domain/vehicle-catalog.model';
import {
  IngestionRunRepository,
  VehicleCatalogRepository,
} from '../domain/vehicle-catalog.repository';
import { IngestionService } from './ingestion.service';

export const INTERRUPTED_RUN_MESSAGE =
  'Interrupted: the service stopped before this run finished';

@Injectable()
export class IngestionStartupService implements OnApplicationBootstrap {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly catalog: VehicleCatalogRepository,
    private readonly runs: IngestionRunRepository,
    private readonly config: AppConfigService,
    @InjectPinoLogger(IngestionStartupService.name)
    private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const interrupted = await this.runs.failInterruptedRuns(
      INTERRUPTED_RUN_MESSAGE,
    );
    if (interrupted > 0) {
      this.logger.warn(
        { count: interrupted },
        'Marked interrupted ingestion runs as failed',
      );
    }

    const { runOnStartup, skipOnStartupIfPopulated } = this.config.ingestion;
    if (!runOnStartup) {
      this.logger.info('Startup ingestion disabled by configuration');
      return;
    }

    if (skipOnStartupIfPopulated) {
      const makes = await this.catalog.countMakes();
      if (makes > 0) {
        this.logger.info(
          { storedMakes: makes },
          'Startup ingestion skipped: the database already has data',
        );
        return;
      }
    }

    try {
      const run = await this.ingestion.start(IngestionTrigger.STARTUP);
      this.logger.info({ runId: run.id }, 'Startup ingestion launched');
    } catch (error) {
      // Never prevent the API from starting because ingestion could not start.
      this.logger.error(
        { error: describeError(error) },
        'Startup ingestion could not be launched',
      );
    }
  }
}
