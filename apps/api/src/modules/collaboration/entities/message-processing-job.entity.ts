import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

export type MessageProcessingJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
export type MessageProcessingJobDomain =
  | 'message'
  | 'task'
  | 'report'
  | 'escalation'
  | 'memory'
  | 'routing';

@Entity({ name: 'message_processing_jobs' })
@Unique('uq_message_processing_jobs_dedupe', ['companyId', 'dedupeKey'])
@Index('idx_message_processing_jobs_company_status_next', ['companyId', 'status', 'nextRunAt'])
@Index('idx_message_processing_jobs_company_domain_status_next', ['companyId', 'domain', 'status', 'nextRunAt'])
export class MessageProcessingJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @Column({ type: 'varchar', length: 32, default: 'message' })
  domain!: MessageProcessingJobDomain;

  @Column({ name: 'job_type', type: 'varchar', length: 64 })
  jobType!: string;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 256 })
  dedupeKey!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: MessageProcessingJobStatus;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 64, nullable: true })
  aggregateType!: string | null;

  @Column({ name: 'aggregate_id', type: 'uuid', nullable: true })
  aggregateId!: string | null;

  @Column({ name: 'parent_job_id', type: 'uuid', nullable: true })
  parentJobId!: string | null;

  @Column({ name: 'correlation_id', type: 'varchar', length: 128, nullable: true })
  correlationId!: string | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true })
  nextRunAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
