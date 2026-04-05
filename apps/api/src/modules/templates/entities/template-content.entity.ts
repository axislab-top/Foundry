import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CompanyTemplate } from './company-template.entity.js';

@Entity('template_contents')
export class TemplateContent {
  @PrimaryColumn({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ type: 'jsonb', default: {} })
  content: Record<string, unknown>;

  /** 惰性解析，避免与 CompanyTemplate 循环 import 导致 TDZ */
  @OneToOne(
    () => 'CompanyTemplate',
    (t: any) => t.content,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'template_id' })
  template: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
