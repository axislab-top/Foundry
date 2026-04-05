import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompanyTemplate } from './company-template.entity.js';
import { MarketplaceAgent } from './marketplace-agent.entity.js';

@Entity('template_agent_mappings')
@Index(['templateId'])
export class TemplateAgentMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @ManyToOne(() => CompanyTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: CompanyTemplate;

  @Column({ name: 'marketplace_agent_id', type: 'uuid' })
  marketplaceAgentId: string;

  @ManyToOne(() => MarketplaceAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplace_agent_id' })
  marketplaceAgent: MarketplaceAgent;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'role_hint', type: 'varchar', length: 64, nullable: true })
  roleHint: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
