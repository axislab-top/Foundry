import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type OrganizationAuditAction = 'create' | 'update' | 'move' | 'delete';

@Entity('organization_audit_logs')
@Index(['companyId', 'createdAt'])
@Index(['companyId', 'nodeId'])
@Index(['companyId', 'userId'])
export class OrganizationAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'node_id', type: 'uuid' })
  nodeId: string;

  @Column({ type: 'varchar', length: 24 })
  action: OrganizationAuditAction;

  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState: Record<string, any> | null;

  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
