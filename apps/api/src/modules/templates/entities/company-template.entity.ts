import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { TemplateContent } from './template-content.entity.js';

export type CompanyTemplateType = 'company' | 'industry_pack' | 'scale_pack';

@Entity('company_templates')
@Index(['industry'])
@Index(['isPublished'])
export class CompanyTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  industry: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  scale: string | null;

  @Column({ name: 'template_type', type: 'varchar', length: 64, default: 'company' })
  templateType: CompanyTemplateType;

  @Column({ name: 'preview_image_url', type: 'varchar', length: 500, nullable: true })
  previewImageUrl: string | null;

  @Column({ name: 'price_cents', type: 'int', default: 0 })
  priceCents: number;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency: string;

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished: boolean;

  @Column({ type: 'varchar', length: 32, default: '1.0.0' })
  version: string;

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

  /** 惰性解析，避免与 TemplateContent 循环 import 导致 TDZ */
  @OneToOne(
    () => 'TemplateContent',
    (c: any) => c.template,
  )
  content?: any;
}
