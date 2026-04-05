import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type TaskRunTriggerSource =
  | 'temporal'
  | 'schedule'
  | 'manual'
  | 'nest_timer';

export type TaskRunStatus = 'running' | 'succeeded' | 'failed';

@Entity('task_runs')
@Index(['companyId', 'startedAt'])
@Index(['companyId', 'status'])
export class TaskRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'trigger_source', type: 'varchar', length: 32, default: 'manual' })
  triggerSource: TaskRunTriggerSource;

  @Column({ name: 'temporal_workflow_id', type: 'varchar', length: 256, nullable: true })
  temporalWorkflowId: string | null;

  @Column({ name: 'temporal_run_id', type: 'varchar', length: 128, nullable: true })
  temporalRunId: string | null;

  @Column({ type: 'varchar', length: 32, default: 'running' })
  status: TaskRunStatus;

  @CreateDateColumn({ name: 'started_at', type: 'timestamp' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finishedAt: Date | null;

  @Column({ name: 'error_summary', type: 'text', nullable: true })
  errorSummary: string | null;

  @Column({
    name: 'cost_estimate',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  costEstimate: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
