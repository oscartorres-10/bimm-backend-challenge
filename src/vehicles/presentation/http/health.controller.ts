import {
  Controller,
  Get,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IngestionService } from '../../application/ingestion.service';

export interface HealthReport {
  status: 'ok';
  database: 'up';
  activeIngestionRunId: number | null;
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ingestion: IngestionService,
  ) {}

  @Get()
  @HttpCode(200)
  async check(): Promise<HealthReport> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }
    return {
      status: 'ok',
      database: 'up',
      activeIngestionRunId: this.ingestion.activeRunId,
    };
  }
}
