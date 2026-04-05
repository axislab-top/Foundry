import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MarketplacePricingModel = 'free' | 'one_time' | 'subscription';

@Entity('marketplace_agents')
@Index(['isPublished'])
@Index(['boundModelName'])
export class MarketplaceAgent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  expertise: string | null;

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt: string | null;

  /** 该商品固定绑定的模型（单选，例如 gpt-4o） */
  @Column({ name: 'bound_model_name', type: 'varchar', length: 120, nullable: true })
  boundModelName: string | null;

  @Column({ name: 'recommended_skills', type: 'jsonb', nullable: true })
  recommendedSkills: unknown[] | null;

  /** 技能标签（检索用，与 expertise 正文互补） */
  @Column({ name: 'skill_tags', type: 'text', array: true })
  skillTags: string[];

  @Column({ name: 'pricing_model', type: 'varchar', length: 32, default: 'free' })
  pricingModel: MarketplacePricingModel;

  @Column({ name: 'price_cents', type: 'int', default: 0 })
  priceCents: number;

  @Column({ name: 'subscription_interval', type: 'varchar', length: 32, nullable: true })
  subscriptionInterval: string | null;

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished: boolean;

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
