/** Unit tests for the health check endpoint. */
import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { IngestionService } from '../../application/ingestion.service';
import { HealthController } from './health.controller';
import { jest } from '../../../../test/helpers/jest';

describe('HealthController', () => {
  const ingestion = { activeRunId: 4 } as IngestionService;

  it('reports ok when the database answers', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ 1: 1 }]) };
    const controller = new HealthController(
      dataSource as unknown as DataSource,
      ingestion,
    );

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
      activeIngestionRunId: 4,
    });
  });

  it('answers 503 when the database is unreachable', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const controller = new HealthController(
      dataSource as unknown as DataSource,
      ingestion,
    );

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
