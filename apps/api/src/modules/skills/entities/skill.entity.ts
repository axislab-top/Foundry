import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SkillImplementationType = 'builtin' | 'langgraph' | 'api' | 'external';

@Entity('skills')
@Index(['companyId'])
@Index(['name'])
export class Skill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null = platform-global skill */
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  category: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'tool_schema', type: 'jsonb', nullable: true })
  toolSchema: Record<string, unknown> | null;

  @Column({ name: 'prompt_template', type: 'text', nullable: true })
  promptTemplate: string | null;

  @Column({ name: 'implementation_type', type: 'varchar', length: 32, default: 'builtin' })
  implementationType: SkillImplementationType;

  @Column({ name: 'handler_config', type: 'jsonb', nullable: true })
  handlerConfig: Record<string, unknown> | null;

  @Column({ name: 'required_permissions', type: 'jsonb', nullable: true })
  requiredPermissions: string[] | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'is_public', type: 'boolean', default: true })
  isPublic: boolean;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'current_revision_id', type: 'uuid', nullable: true })
  currentRevisionId: string | null;

  @Column({ name: 'published_revision_id', type: 'uuid', nullable: true })
  publishedRevisionId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
