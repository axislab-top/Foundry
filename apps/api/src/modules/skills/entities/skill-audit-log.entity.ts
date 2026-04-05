import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('skill_audit_logs')
@Index(['companyId'])
@Index(['skillId'])
@Index(['createdAt'])
export class SkillAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null = platform/global scope */
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'skill_id', type: 'uuid', nullable: true })
  skillId: string | null;

  @Column({ name: 'skill_name', type: 'varchar', length: 255, nullable: true })
  skillName: string | null;

  @Column({ name: 'action_type', type: 'varchar', length: 32 })
  actionType: string;

  @Column({ name: 'changed_by_user_id', type: 'uuid', nullable: true })
  changedByUserId: string | null;

  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState: Record<string, unknown> | null;

  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState: Record<string, unknown> | null;

  @Column({ name: 'scan_result', type: 'jsonb', nullable: true })
  scanResult: Record<string, unknown> | null;

  @Column({ name: 'risk_level', type: 'varchar', length: 16, nullable: true })
  riskLevel: string | null;

  @Column({ name: 'review_status', type: 'varchar', length: 16, default: 'logged' })
  reviewStatus: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}

