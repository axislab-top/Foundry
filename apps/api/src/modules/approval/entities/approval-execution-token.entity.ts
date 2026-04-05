import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('approval_execution_tokens')
@Index(['companyId', 'expiresAt'])
@Index(['approvalRequestId'])
export class ApprovalExecutionToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'approval_request_id', type: 'uuid' })
  approvalRequestId: string;

  @Column({ type: 'varchar', length: 128 })
  action: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamp', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
