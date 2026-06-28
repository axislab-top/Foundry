import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('skill_tool_bindings')
@Index(['skillId', 'toolId'], { unique: true })
@Index(['companyId', 'skillId', 'position'])
export class SkillToolBinding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'skill_id', type: 'uuid' })
  skillId: string;

  @Column({ name: 'tool_id', type: 'uuid' })
  toolId: string;

  @Column({ name: 'position', type: 'int', default: 0 })
  position: number;

  @Column({ name: 'is_overridden', type: 'boolean', default: false })
  isOverridden: boolean;

  @Column({ name: 'config_override', type: 'jsonb', nullable: true })
  configOverride: Record<string, unknown> | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  /** Admin actor audit (admin_users) */
  @Column({ name: 'created_by_admin', type: 'uuid', nullable: true })
  createdByAdmin: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}

