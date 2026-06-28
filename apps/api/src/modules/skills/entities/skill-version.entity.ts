import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('skill_versions')
@Index(['skillId', 'version'], { unique: true })
@Index(['companyId', 'skillId'])
export class SkillVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'skill_id', type: 'uuid' })
  skillId: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  /** Admin actor audit (admin_users) */
  @Column({ name: 'created_by_admin', type: 'uuid', nullable: true })
  createdByAdmin: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}

