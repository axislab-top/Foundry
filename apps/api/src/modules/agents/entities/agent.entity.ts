import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AgentRole = 'ceo' | 'director' | 'board_member' | 'executor';
export type AgentStatus = 'active' | 'inactive' | 'suspended';

@Entity('agents')
@Index(['companyId', 'role'])
@Index(['companyId', 'status'])
@Index(['organizationNodeId'])
@Index(['companyId', 'reportsToAgentId'])
@Index(['companyId', 'hierarchyVersion'])
@Index(['companyId', 'llmKeyId'])
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'organization_node_id', type: 'uuid', nullable: true })
  organizationNodeId: string | null;

  @Column({ name: 'reports_to_agent_id', type: 'uuid', nullable: true })
  reportsToAgentId: string | null;

  @Column({ name: 'hierarchy_version', type: 'integer', default: 1 })
  hierarchyVersion: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 64 })
  role: AgentRole;

  @Column({ type: 'text', nullable: true })
  expertise: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt: string | null;

  @Column({ name: 'llm_model', type: 'varchar', length: 120, nullable: true })
  llmModel: string | null;

  /** 运行时固定使用的 LLM Key（从 Marketplace 安装/购买后分配）；为空则走全局池 acquire(modelName) */
  @Column({ name: 'llm_key_id', type: 'uuid', nullable: true })
  llmKeyId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  personality: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: AgentStatus;

  @Column({ name: 'human_in_loop', type: 'boolean', default: false })
  humanInLoop: boolean;

  @Column({ name: 'pending_config', type: 'jsonb', nullable: true })
  pendingConfig: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
