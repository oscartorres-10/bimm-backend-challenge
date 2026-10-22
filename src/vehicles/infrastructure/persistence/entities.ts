import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Table `makes`: one row per manufacturer. */
@Entity({ name: 'makes' })
export class MakeEntity {
  /** The vPIC Make_ID. We reuse the source id instead of generating one. */
  @PrimaryColumn({ type: 'integer' })
  id: number;

  /** Indexed because lists are sorted and filtered by name. */
  @Index('idx_makes_name')
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'vehicle_types_synced_at', type: Date, nullable: true })
  vehicleTypesSyncedAt: Date | null;

  @Column({ name: 'last_ingested_at', type: Date })
  lastIngestedAt: Date;
}

/** Table `vehicle_types`: one row per vehicle category. */
@Entity({ name: 'vehicle_types' })
export class VehicleTypeEntity {
  /** The vPIC VehicleTypeId. */
  @PrimaryColumn({ type: 'integer' })
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;
}

/** Table `make_vehicle_types`: links a make to each of its vehicle types. */
@Entity({ name: 'make_vehicle_types' })
export class MakeVehicleTypeEntity {
  @PrimaryColumn({ name: 'make_id', type: 'integer' })
  makeId: number;

  /** Indexed to answer "which makes build trucks?" quickly. */
  @Index('idx_make_vehicle_types_vehicle_type_id')
  @PrimaryColumn({ name: 'vehicle_type_id', type: 'integer' })
  vehicleTypeId: number;

  /** Deleting a make automatically deletes its links (CASCADE). */
  @ManyToOne(() => MakeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'make_id' })
  make?: MakeEntity;

  @ManyToOne(() => VehicleTypeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_type_id' })
  vehicleType?: VehicleTypeEntity;
}

/** Table `ingestion_runs`: history of every ingestion execution. */
@Entity({ name: 'ingestion_runs' })
export class IngestionRunEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: number;

  /** One of the IngestionStatus values, stored as text. */
  @Index('idx_ingestion_runs_status')
  @Column({ type: 'varchar', length: 32 })
  status: string;

  /** One of the IngestionTrigger values, stored as text. */
  @Column({ type: 'varchar', length: 32 })
  trigger: string;

  @Column({ name: 'started_at', type: Date })
  startedAt: Date;

  @Column({ name: 'finished_at', type: Date, nullable: true })
  finishedAt: Date | null;

  @Column({ name: 'total_makes', type: 'integer', default: 0 })
  totalMakes: number;

  @Column({ name: 'processed_makes', type: 'integer', default: 0 })
  processedMakes: number;

  @Column({ name: 'failed_makes', type: 'integer', default: 0 })
  failedMakes: number;

  @Column({ name: 'rejected_records', type: 'integer', default: 0 })
  rejectedRecords: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;
}

/** Every entity, so the database configuration can register them. */
export const ENTITIES = [
  MakeEntity,
  VehicleTypeEntity,
  MakeVehicleTypeEntity,
  IngestionRunEntity,
];
