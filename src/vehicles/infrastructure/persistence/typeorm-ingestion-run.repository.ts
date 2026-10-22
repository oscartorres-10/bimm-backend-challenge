import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  type IngestionRun,
  IngestionStatus,
  IngestionTrigger,
} from '../../domain/vehicle-catalog.model';
import {
  IngestionRunRepository,
  type IngestionRunUpdate,
} from '../../domain/vehicle-catalog.repository';
import { IngestionRunEntity } from './entities';
import { withPersistenceErrors } from './with-persistence-errors';

/** Converts a database row into the domain shape. */
function toIngestionRun(entity: IngestionRunEntity): IngestionRun {
  return {
    id: entity.id,
    status: entity.status as IngestionStatus,
    trigger: entity.trigger as IngestionTrigger,
    startedAt: entity.startedAt,
    finishedAt: entity.finishedAt,
    totalMakes: entity.totalMakes,
    processedMakes: entity.processedMakes,
    failedMakes: entity.failedMakes,
    rejectedRecords: entity.rejectedRecords,
    errorMessage: entity.errorMessage,
  };
}

@Injectable()
export class TypeOrmIngestionRunRepository extends IngestionRunRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  private get repository() {
    return this.dataSource.getRepository(IngestionRunEntity);
  }

  create(trigger: IngestionTrigger): Promise<IngestionRun> {
    return withPersistenceErrors('createIngestionRun', async () => {
      const saved = await this.repository.save(
        this.repository.create({
          status: IngestionStatus.RUNNING,
          trigger,
          startedAt: new Date(),
          finishedAt: null,
          totalMakes: 0,
          processedMakes: 0,
          failedMakes: 0,
          rejectedRecords: 0,
          errorMessage: null,
        }),
      );
      return toIngestionRun(saved);
    });
  }

  update(id: number, changes: IngestionRunUpdate): Promise<IngestionRun> {
    return withPersistenceErrors('updateIngestionRun', async () => {
      await this.repository.update({ id }, changes);
      return toIngestionRun(await this.repository.findOneByOrFail({ id }));
    });
  }

  findById(id: number): Promise<IngestionRun | null> {
    return withPersistenceErrors('findIngestionRun', async () => {
      const row = await this.repository.findOneBy({ id });
      return row ? toIngestionRun(row) : null;
    });
  }

  findLatest(): Promise<IngestionRun | null> {
    return withPersistenceErrors('findLatestIngestionRun', async () => {
      const [row] = await this.repository.find({
        order: { id: 'DESC' },
        take: 1,
      });
      return row ? toIngestionRun(row) : null;
    });
  }

  failInterruptedRuns(message: string): Promise<number> {
    return withPersistenceErrors('failInterruptedRuns', async () => {
      const result = await this.repository.update(
        { status: IngestionStatus.RUNNING },
        {
          status: IngestionStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: message,
        },
      );
      return result.affected ?? 0;
    });
  }
}
