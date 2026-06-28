import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('model_pricing')
@Index(['companyId', 'modelName', 'effectiveFrom'])
export class ModelPricing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 平台默认定价时为空；租户覆盖时为公司 ID */
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'model_name', type: 'varchar', length: 120 })
  modelName: string;

  /** 绑定 llm_models.id；非空时目录解析优先匹配此行 */
  @Column({ name: 'llm_model_id', type: 'uuid', nullable: true })
  llmModelId: string | null;

  @Column({
    name: 'input_price_per_million',
    type: 'numeric',
    precision: 18,
    scale: 6,
    default: 0,
  })
  inputPricePerMillion: string;

  @Column({
    name: 'output_price_per_million',
    type: 'numeric',
    precision: 18,
    scale: 6,
    default: 0,
  })
  outputPricePerMillion: string;

  @Column({
    name: 'embedding_price_per_million',
    type: 'numeric',
    precision: 18,
    scale: 6,
    default: 0,
  })
  embeddingPricePerMillion: string;

  @Column({
    name: 'skill_base_fee',
    type: 'numeric',
    precision: 18,
    scale: 6,
    default: 0,
  })
  skillBaseFee: string;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency: string;

  @Column({ name: 'effective_from', type: 'timestamp' })
  effectiveFrom: Date;

  @Column({ name: 'effective_to', type: 'timestamp', nullable: true })
  effectiveTo: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
