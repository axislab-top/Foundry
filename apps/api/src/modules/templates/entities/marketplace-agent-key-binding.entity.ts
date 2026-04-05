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

@Entity('marketplace_agent_key_bindings')
@Index(['marketplaceAgentId', 'sortOrder'])
@Index(['llmKeyId'], { unique: true })
@Index(['marketplaceAgentId', 'llmKeyId'], { unique: true })
export class MarketplaceAgentKeyBinding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'marketplace_agent_id', type: 'uuid' })
  marketplaceAgentId: string;

  @ManyToOne(() => MarketplaceAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplace_agent_id' })
  marketplaceAgent: MarketplaceAgent;

  @Column({ name: 'llm_key_id', type: 'uuid' })
  llmKeyId: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

