import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MarketplaceAgent } from './marketplace-agent.entity.js';

@Entity('platform_departments')
@Index(['sortOrder', 'displayName'])
export class PlatformDepartment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 稳定英文标识，写入 marketplace_agents.department_roles */
  @Column({ type: 'varchar', length: 64, unique: true })
  slug: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** 新建公司默认启用（基础部门） */
  @Column({ name: 'is_default_for_new_company', type: 'boolean', default: false })
  isDefaultForNewCompany: boolean;

  @Column({ type: 'varchar', length: 32, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  icon: string | null;

  @Column({ name: 'recommended_head_token', type: 'varchar', length: 64, nullable: true })
  recommendedHeadToken: string | null;

  @Column({ name: 'default_skills', type: 'jsonb', nullable: true })
  defaultSkills: unknown[] | null;

  @Column({ name: 'responsibility_summary', type: 'text', nullable: true })
  responsibilitySummary: string | null;

  @Column({ name: 'task_type_tags', type: 'jsonb', default: () => "'[]'" })
  taskTypeTags: string[];

  @Column({ name: 'excludes_task_type_tags', type: 'jsonb', default: () => "'[]'" })
  excludesTaskTypeTags: string[];

  /** 总监可延后绑定：允许为 NULL，FK ON DELETE SET NULL */
  @ManyToOne(() => MarketplaceAgent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'director_marketplace_agent_id' })
  director: MarketplaceAgent | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
