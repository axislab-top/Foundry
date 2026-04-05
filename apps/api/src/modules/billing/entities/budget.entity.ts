import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BudgetScope = 'company' | 'department' | 'agent';
export type BudgetPeriod = 'none' | 'monthly' | 'quarterly';

@Entity('budgets')
@Index(['companyId', 'scope'])
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ type: 'varchar', length: 32, default: 'company' })
  scope: BudgetScope;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ type: 'varchar', length: 32, default: 'monthly' })
  period: BudgetPeriod;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 4, default: 0 })
  totalAmount: string;

  @Column({ name: 'used_amount', type: 'numeric', precision: 18, scale: 4, default: 0 })
  usedAmount: string;

  @Column({
    name: 'warning_threshold',
    type: 'numeric',
    precision: 5,
    scale: 4,
    default: 0.8,
  })
  warningThreshold: string;

  @Column({ name: 'period_start', type: 'timestamp', nullable: true })
  periodStart: Date | null;

  @Column({ name: 'period_end', type: 'timestamp', nullable: true })
  periodEnd: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
