import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MarketplaceEmploymentType = 'permanent' | 'temporary';
export type MarketplaceAgentSubscriptionStatus = 'active' | 'cancelled';

@Entity('marketplace_agent_subscriptions')
@Index(['companyId', 'status'])
@Index(['companyId', 'marketplaceAgentId', 'organizationNodeId'])
export class MarketplaceAgentSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'marketplace_agent_id', type: 'uuid' })
  marketplaceAgentId: string;

  @Column({ name: 'organization_node_id', type: 'uuid', nullable: true })
  organizationNodeId: string | null;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ name: 'employment_type', type: 'varchar', length: 16, default: 'permanent' })
  employmentType: MarketplaceEmploymentType;

  /** 临时雇佣绑定项目（当前对齐 tasks.id） */
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ name: 'daily_price_cents', type: 'int', default: 0 })
  dailyPriceCents: number;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: MarketplaceAgentSubscriptionStatus;

  @Column({ name: 'started_on', type: 'date' })
  startedOn: string;

  @Column({ name: 'ended_on', type: 'date', nullable: true })
  endedOn: string | null;

  @Column({ name: 'last_billed_on', type: 'date', nullable: true })
  lastBilledOn: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

