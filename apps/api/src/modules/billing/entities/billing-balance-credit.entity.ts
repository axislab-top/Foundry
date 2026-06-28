import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** 充值入账审计行（双写 budgets.total_amount）；不作为扣费来源。 */
@Entity('billing_balance_credits')
@Index(['companyId', 'createdAt'])
export class BillingBalanceCredit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid', unique: true })
  orderId: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'budget_id', type: 'uuid' })
  budgetId: string;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency: string;

  @Column({ name: 'budget_total_after', type: 'numeric', precision: 18, scale: 4 })
  budgetTotalAfter: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
