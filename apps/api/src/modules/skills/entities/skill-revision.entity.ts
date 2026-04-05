import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { SkillImplementationType } from './skill.entity.js';

export type SkillRevisionStatus = 'draft' | 'published' | 'revoked';
export type SkillRevisionReviewStatus = 'pending' | 'approved' | 'rejected';

@Entity('skill_revisions')
@Index(['skillId', 'version'], { unique: true })
@Index(['skillId', 'status'])
export class SkillRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'skill_id', type: 'uuid' })
  skillId: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 16, default: 'published' })
  status: SkillRevisionStatus;

  @Column({ name: 'review_status', type: 'varchar', length: 16, default: 'pending' })
  reviewStatus: SkillRevisionReviewStatus;

  @Column({ name: 'risk_level', type: 'varchar', length: 16, nullable: true })
  riskLevel: string | null;

  @Column({ name: 'scan_result', type: 'jsonb', nullable: true })
  scanResult: Record<string, unknown> | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment: string | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

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

  @Column({ name: 'is_public', type: 'boolean', default: true })
  isPublic: boolean;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'artifact_id', type: 'uuid', nullable: true })
  artifactId: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}

