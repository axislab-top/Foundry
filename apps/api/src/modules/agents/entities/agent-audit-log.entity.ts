import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AgentAuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'assign_node'
  | 'skills_bind'
  | 'skills_unbind'
  | 'approve';

@Entity('agent_audit_logs')
@Index(['companyId', 'createdAt'])
@Index(['companyId', 'agentId'])
export class AgentAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ type: 'varchar', length: 64 })
  action: AgentAuditAction;

  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState: Record<string, unknown> | null;

  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
