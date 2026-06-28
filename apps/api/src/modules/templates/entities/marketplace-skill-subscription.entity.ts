import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MarketplaceSkillSubscriptionStatus = 'active' | 'cancelled';

@Entity('marketplace_skill_subscriptions')
@Index(['companyId', 'status'])
@Index(['companyId', 'marketplaceSkillPackageId'])
export class MarketplaceSkillSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'marketplace_skill_package_id', type: 'uuid' })
  marketplaceSkillPackageId: string;

  @Column({ name: 'purchased_skill_id', type: 'uuid', nullable: true })
  purchasedSkillId: string | null;

  @Column({ name: 'price_cents', type: 'int', default: 0 })
  priceCents: number;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: MarketplaceSkillSubscriptionStatus;

  @Column({ name: 'started_on', type: 'date' })
  startedOn: string;

  @Column({ name: 'last_billed_on', type: 'date', nullable: true })
  lastBilledOn: string | null;

  @Column({ name: 'ended_on', type: 'date', nullable: true })
  endedOn: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

