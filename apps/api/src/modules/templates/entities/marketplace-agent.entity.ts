import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MarketplaceAgentCategory = 'ceo' | 'department_head' | 'employee';

export type MarketplacePricingModel = 'free' | 'one_time' | 'subscription';

@Entity('marketplace_agents')
@Index(['isPublished'])
@Index(['boundModelName'])
@Index(['isPublished', 'agentCategory'])
@Index(['agentCategory', 'updatedAt'])
export class MarketplaceAgent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** 列表/招聘页展示用图标（通常为 HTTPS 图片 URL） */
  @Column({ name: 'icon_url', type: 'varchar', length: 2048, nullable: true })
  iconUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  expertise: string | null;

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt: string | null;

  /** 该商品固定绑定的模型（单选，例如 gpt-4o） */
  @Column({ name: 'bound_model_name', type: 'varchar', length: 120, nullable: true })
  boundModelName: string | null;

  /** CEO 三层配置模板默认值（Classifier / Light / Heavy） */
  @Column({ name: 'ceo_layer_config', type: 'jsonb', nullable: false, default: () => "'{}'" })
  ceoLayerConfig: Record<string, unknown>;

  @Column({ name: 'recommended_skills', type: 'jsonb', nullable: true })
  recommendedSkills: unknown[] | null;

  /**
   * P20：商城显式钉住的 Global Skill **行 ID**（某 semver 版本），与 `recommendedSkills`（name 列表）并存；
   * 运行时 Resolver 可优先用此处解析，缺省时仍按 name + latest。
   */
  @Column({ name: 'recommended_skill_version_ids', type: 'uuid', array: true, nullable: true })
  recommendedSkillVersionIds: string[] | null;

  /** 技能标签（检索用，与 expertise 正文互补） */
  @Column({ name: 'skill_tags', type: 'text', array: true })
  skillTags: string[];

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished: boolean;

  @Column({ name: 'agent_category', type: 'varchar', length: 32, default: 'employee' })
  agentCategory: MarketplaceAgentCategory;

  /**
   * Department role tags used for matching a department head.
   * Examples: ['marketing', 'engineering'] or Chinese department names like ['市场部'] (depending on admin configuration).
   */
  @Column({ name: 'department_roles', type: 'text', array: true, default: () => "'{}'" })
  departmentRoles: string[];

  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount: number;

  @Column({ name: 'rating_avg', type: 'numeric', precision: 4, scale: 2, nullable: true })
  ratingAvg: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
