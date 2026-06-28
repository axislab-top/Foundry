import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'collaboration_orchestration_runs' })
@Unique('uq_collab_orch_run_company_message', ['companyId', 'sourceMessageId'])
@Index('idx_collab_orch_runs_room_updated', ['companyId', 'roomId', 'updatedAt'])
export class CollaborationOrchestrationRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @Column({ name: 'source_message_id', type: 'uuid' })
  sourceMessageId!: string;

  @Column({ name: 'program_id', type: 'uuid', nullable: true })
  programId!: string | null;

  @Column({ name: 'worker_run_id', type: 'uuid', nullable: true })
  workerRunId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  stage!: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
