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
@Index(['marketplaceAgentId', 'ceoLayer', 'sortOrder'])
@Index(['llmKeyId'], { unique: true })
@Index(['marketplaceAgentId', 'ceoLayer', 'llmKeyId'], { unique: true })
export class MarketplaceAgentKeyBinding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'marketplace_agent_id', type: 'uuid' })
  marketplaceAgentId: string;

  /** 普通商品为 default；slug=ceo 时为 strategy/orchestration/supervision 之一 */
  @Column({ name: 'ceo_layer', type: 'varchar', length: 32, default: 'default' })
  ceoLayer: string;

  @ManyToOne(() => MarketplaceAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplace_agent_id' })
  marketplaceAgent: MarketplaceAgent;

  @Column({ name: 'llm_key_id', type: 'uuid' })
  llmKeyId: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** 商城级 Embedding 池条目（与 LLM 候选行一并保存，全行复用同一 id） */
  @Column({ name: 'embedding_model_id', type: 'uuid', nullable: true })
  embeddingModelId: string | null;

  @Column({ name: 'embedding_is_primary', type: 'boolean', default: true })
  embeddingIsPrimary: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

