import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type BillingRecordType = 'llm' | 'skill' | 'embedding' | 'summary' | 'other';

@Entity('billing_records')
@Index(['companyId', 'occurredAt'])
@Index(['companyId', 'agentId', 'occurredAt'])
export class BillingRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId: string | null;

  @Column({ name: 'skill_id', type: 'uuid', nullable: true })
  skillId: string | null;

  @Column({ name: 'llm_key_id', type: 'uuid', nullable: true })
  llmKeyId: string | null;

  @Column({ name: 'record_type', type: 'varchar', length: 32 })
  recordType: BillingRecordType;

  @Column({ name: 'model_name', type: 'varchar', length: 120, nullable: true })
  modelName: string | null;

  @Column({ name: 'input_tokens', type: 'int', default: 0 })
  inputTokens: number;

  @Column({ name: 'output_tokens', type: 'int', default: 0 })
  outputTokens: number;

  @Column({ name: 'skill_call_units', type: 'numeric', precision: 12, scale: 4, default: 0 })
  skillCallUnits: string;

  @Column({ type: 'numeric', precision: 18, scale: 6, default: 0 })
  cost: string;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'occurred_at', type: 'timestamp' })
  occurredAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
