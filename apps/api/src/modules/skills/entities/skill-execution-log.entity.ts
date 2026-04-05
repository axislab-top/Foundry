import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('skill_execution_logs')
@Index(['companyId', 'createdAt'])
@Index(['companyId', 'agentId'])
export class SkillExecutionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @Column({ name: 'skill_id', type: 'uuid', nullable: true })
  skillId: string | null;

  @Column({ name: 'skill_name', type: 'varchar', length: 255 })
  skillName: string;

  @Column({ name: 'trace_id', type: 'varchar', length: 64, nullable: true })
  traceId: string | null;

  @Column({ name: 'args_summary', type: 'jsonb', nullable: true })
  argsSummary: Record<string, unknown> | null;

  @Column({ name: 'result_summary', type: 'jsonb', nullable: true })
  resultSummary: Record<string, unknown> | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'billing_units', type: 'decimal', precision: 12, scale: 4, nullable: true })
  billingUnits: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
