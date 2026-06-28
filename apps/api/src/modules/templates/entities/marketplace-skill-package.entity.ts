import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { MarketplacePricingModel } from './marketplace-agent.entity.js';

@Entity('marketplace_skill_packages')
@Index(['isPublished'])
@Index(['slug'], { unique: true })
export class MarketplaceSkillPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'source_skill_id', type: 'uuid' })
  sourceSkillId: string;

  @Column({ name: 'source_revision_id', type: 'uuid', nullable: true })
  sourceRevisionId: string | null;

  @Column({ name: 'version_label', type: 'varchar', length: 32, nullable: true })
  versionLabel: string | null;

  @Column({ name: 'governance_snapshot', type: 'jsonb', nullable: true })
  governanceSnapshot: Record<string, unknown> | null;

  @Column({ name: 'handler_config_snapshot', type: 'jsonb', nullable: true })
  handlerConfigSnapshot: Record<string, unknown> | null;

  @Column({ name: 'mcp_tools_snapshot', type: 'jsonb', nullable: true })
  mcpToolsSnapshot: unknown[] | null;

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

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

