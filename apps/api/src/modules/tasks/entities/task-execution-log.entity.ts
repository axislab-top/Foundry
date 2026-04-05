import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('task_execution_logs')
@Index(['companyId', 'taskId', 'createdAt'])
@Index(['companyId', 'agentId'])
export class TaskExecutionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId: string | null;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ name: 'step_type', type: 'varchar', length: 64 })
  stepType: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ name: 'output_snapshot', type: 'jsonb', nullable: true })
  outputSnapshot: Record<string, unknown> | null;

  @Column({ name: 'billing_units', type: 'decimal', precision: 12, scale: 4, nullable: true })
  billingUnits: string | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'trace_id', type: 'varchar', length: 64, nullable: true })
  traceId: string | null;

  @Column({ name: 'run_id', type: 'uuid', nullable: true })
  runId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
