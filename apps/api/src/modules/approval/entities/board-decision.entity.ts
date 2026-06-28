import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type BoardDecisionStatus = 'open' | 'passed' | 'rejected' | 'cancelled' | 'expired';

@Entity('board_decisions')
@Index(['companyId', 'status'])
@Index(['companyId', 'approvalFlowId'])
export class BoardDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  /** Link to MultiLevelApproval.approvalFlowId */
  @Column({ name: 'approval_flow_id', type: 'varchar', length: 64 })
  approvalFlowId: string;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: BoardDecisionStatus;

  /** required votes count (quorum) */
  @Column({ type: 'int', default: 1 })
  quorum: number;

  /**
   * votes: { actorId: 'approved'|'rejected'|'abstain', ... }
   * MVP: stored as jsonb; can be normalized later.
   */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  votes: Record<string, 'approved' | 'rejected' | 'abstain'>;

  @Column({ name: 'final_decision', type: 'varchar', length: 16, nullable: true })
  finalDecision: 'approved' | 'rejected' | null;

  @Column({ name: 'final_reason', type: 'text', nullable: true })
  finalReason: string | null;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

