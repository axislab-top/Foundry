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

  /**
   * 历史：安装时独占分配的 Key。新安装可为空，运行时以商城 bindings 为主，本字段仅作兜底。
   */
  @Column({ name: 'assigned_llm_key_id', type: 'uuid', nullable: true })
  assignedLlmKeyId: string | null;

  /** 公司在可选范围内显式钉选的 Key（须仍在当前商城池或 layer 池内才会被优先使用）。 */
  @Column({ name: 'preferred_llm_key_id', type: 'uuid', nullable: true })
  preferredLlmKeyId: string | null;

  /** 预留：与订阅/计费行关联 */
  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @Column({ name: 'assigned_embedding_model_id', type: 'uuid', nullable: true })
  assignedEmbeddingModelId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

