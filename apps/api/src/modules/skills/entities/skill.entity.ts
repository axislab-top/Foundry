import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SkillImplementationType = 'prompt' | 'builtin' | 'langgraph' | 'api' | 'external' | 'mcp';
export type SkillChunkStrategy = 'none' | 'fixed' | 'semantic';

@Entity('skills')
@Index(['companyId'])
@Index(['name'])
export class Skill {
  // P0 Skill Governance Fields - 2026
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null = platform-global skill */
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'display_name', type: 'varchar', length: 200, nullable: true })
  displayName: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'tool_schema', type: 'jsonb', nullable: true })
  toolSchema: Record<string, unknown> | null;

  @Column({ name: 'input_schema', type: 'jsonb', nullable: true })
  inputSchema: Record<string, unknown> | null;

  @Column({ name: 'output_schema', type: 'jsonb', nullable: true })
  outputSchema: Record<string, unknown> | null;

  @Column({ name: 'prompt_template', type: 'text', nullable: true })
  promptTemplate: string | null;

  @Column({ name: 'implementation_type', type: 'varchar', length: 32, default: 'builtin' })
  implementationType: SkillImplementationType;

  @Column({ name: 'handler_config', type: 'jsonb', nullable: true })
  handlerConfig: Record<string, unknown> | null;

  @Column({ name: 'required_permissions', type: 'jsonb', nullable: true })
  requiredPermissions: string[] | null;

  @Column({ name: 'security_profile', type: 'varchar', length: 24, default: 'safe' })
  securityProfile: 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';

  @Column({ name: 'is_enabled', type: 'boolean', default: false })
  isEnabled: boolean;

  @Column({ name: 'approval_request_id', type: 'uuid', nullable: true })
  approvalRequestId: string | null;

  @Column({ name: 'approval_status', type: 'varchar', length: 16, default: 'none' })
  approvalStatus: 'none' | 'pending' | 'approved' | 'rejected';

  @Column({ name: 'change_reason', type: 'text', nullable: true })
  changeReason: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  /** Admin actor audit (admin_users) */
  @Column({ name: 'created_by_admin', type: 'uuid', nullable: true })
  createdByAdmin: string | null;

  @Column({ name: 'updated_by_admin', type: 'uuid', nullable: true })
  updatedByAdmin: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  /** 行级语义版本（与 int `version` 修订号并存；未迁移行默认 1.0.0） */
  @Column({ name: 'semver_version', type: 'varchar', length: 64, default: '1.0.0' })
  semverVersion: string;

  /** 同名全局 Skill 中是否为当前默认 latest 行（解析 recommended / CEO name→id 时用） */
  @Column({ name: 'is_latest', type: 'boolean', default: true })
  isLatest: boolean;

  @Column({ type: 'text', nullable: true })
  changelog: string | null;

  @Column({ name: 'is_public', type: 'boolean', default: true })
  isPublic: boolean;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'max_input_tokens', type: 'int', nullable: true })
  maxInputTokens: number | null;

  @Column({ name: 'max_output_tokens', type: 'int', nullable: true })
  maxOutputTokens: number | null;

  @Column({ name: 'max_input_size_bytes', type: 'int', nullable: true })
  maxInputSizeBytes: number | null;

  @Column({ name: 'timeout_seconds', type: 'int', nullable: true, default: 300 })
  timeoutSeconds: number;

  @Column({ name: 'chunk_strategy', type: 'varchar', length: 16, nullable: true, default: 'none' })
  chunkStrategy: SkillChunkStrategy;

  @Column({ type: 'jsonb', nullable: true })
  category: string[] | null;

  @Column({ type: 'text', nullable: true })
  icon: string | null;

  @Column({ name: 'current_revision_id', type: 'uuid', nullable: true })
  currentRevisionId: string | null;

  @Column({ name: 'published_revision_id', type: 'uuid', nullable: true })
  publishedRevisionId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
