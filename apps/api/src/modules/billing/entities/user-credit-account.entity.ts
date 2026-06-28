import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_credit_accounts')
export class UserCreditAccount {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 4, default: '0' })
  totalAmount: string;

  @Column({ name: 'used_amount', type: 'numeric', precision: 18, scale: 4, default: '0' })
  usedAmount: string;

  @Column({ type: 'varchar', length: 8, default: 'CREDIT' })
  currency: string;

  @Column({ name: 'granted_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  grantedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
