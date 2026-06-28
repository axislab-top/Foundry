import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('daily_agent_usage')
@Index(['companyId', 'agentId', 'usageDate'], { unique: true })
@Index(['companyId', 'usageDate'])
export class DailyAgentUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @Column({ name: 'usage_date', type: 'date' })
  usageDate: string;

  @Column({ name: 'input_tokens', type: 'bigint', default: 0 })
  inputTokens: string;

  @Column({ name: 'output_tokens', type: 'bigint', default: 0 })
  outputTokens: string;

  @Column({ name: 'input_cost', type: 'numeric', precision: 18, scale: 6, default: 0 })
  inputCost: string;

  @Column({ name: 'output_cost', type: 'numeric', precision: 18, scale: 6, default: 0 })
  outputCost: string;

  @Column({ name: 'total_cost', type: 'numeric', precision: 18, scale: 6, default: 0 })
  totalCost: string;

  @Column({ name: 'llm_model', type: 'varchar', length: 120, nullable: true })
  llmModel: string | null;

  @Column({ name: 'call_count', type: 'int', default: 0 })
  count: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

