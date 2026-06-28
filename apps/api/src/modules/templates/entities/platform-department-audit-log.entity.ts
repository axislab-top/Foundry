import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MarketplaceAgent } from './marketplace-agent.entity.js';
import { PlatformDepartment } from './platform-department.entity.js';

export type PlatformDepartmentAuditAction = 'head_bound' | 'head_unbound' | 'head_replaced' | 'department_created';

@Entity('platform_department_audit_logs')
@Index(['platformDepartmentId', 'createdAt'])
export class PlatformDepartmentAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'platform_department_id', type: 'uuid' })
  platformDepartmentId: string;

  @ManyToOne(() => PlatformDepartment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_department_id' })
  platformDepartment: PlatformDepartment;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId: string;

  @Column({ type: 'varchar', length: 24 })
  action: PlatformDepartmentAuditAction;

  @Column({ name: 'previous_marketplace_agent_id', type: 'uuid', nullable: true })
  previousMarketplaceAgentId: string | null;

  @ManyToOne(() => MarketplaceAgent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'previous_marketplace_agent_id' })
  previousAgent: MarketplaceAgent | null;

  @Column({ name: 'new_marketplace_agent_id', type: 'uuid', nullable: true })
  newMarketplaceAgentId: string | null;

  @ManyToOne(() => MarketplaceAgent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'new_marketplace_agent_id' })
  newAgent: MarketplaceAgent | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
