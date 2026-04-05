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

@Entity('company_marketplace_agent_key_assignments')
@Index(['companyId', 'marketplaceAgentId'], { unique: true })
@Index(['assignedLlmKeyId'], { unique: true })
@Index(['companyId'])
export class CompanyMarketplaceAgentKeyAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'marketplace_agent_id', type: 'uuid' })
  marketplaceAgentId: string;

  @ManyToOne(() => MarketplaceAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplace_agent_id' })
  marketplaceAgent: MarketplaceAgent;

  @Column({ name: 'assigned_llm_key_id', type: 'uuid' })
  assignedLlmKeyId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

