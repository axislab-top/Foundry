import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MarketplaceHireRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'failed';

export type MarketplaceEmploymentType = 'permanent' | 'temporary';

@Entity('marketplace_hire_requests')
@Index(['companyId', 'status'])
@Index(['companyId', 'createdAt'])
export class MarketplaceHireRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'marketplace_agent_id', type: 'uuid' })
  marketplaceAgentId: string;

  @Column({ name: 'organization_node_id', type: 'uuid' })
  organizationNodeId: string;

  @Column({ name: 'employment_type', type: 'varchar', length: 16, default: 'permanent' })
  employmentType: MarketplaceEmploymentType;

  /** 临时雇佣绑定的项目（projects.id） */
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status: MarketplaceHireRequestStatus;

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId: string;

  @Column({ name: 'requested_reason', type: 'text', nullable: true })
  requestedReason: string | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'reject_reason', type: 'text', nullable: true })
  rejectReason: string | null;

  @Column({ name: 'purchase_event_id', type: 'uuid', nullable: true })
  purchaseEventId: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'result_agent_id', type: 'uuid', nullable: true })
  resultAgentId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
