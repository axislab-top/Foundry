import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ApprovalRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled';

@Entity('approval_requests')
@Index(['companyId', 'status'])
export class ApprovalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status: ApprovalRequestStatus;

  @Column({ name: 'risk_level', type: 'varchar', length: 8, default: 'L2' })
  riskLevel: string;

  @Column({ name: 'action_type', type: 'varchar', length: 64 })
  actionType: string;

  @Column({ type: 'jsonb', nullable: true })
  context: Record<string, unknown> | null;

  @Column({ name: 'temporal_workflow_id', type: 'varchar', length: 256, nullable: true })
  temporalWorkflowId: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
