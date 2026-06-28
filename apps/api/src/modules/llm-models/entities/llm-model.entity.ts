import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type LlmModelType = 'chat' | 'embedding' | 'rerank' | 'image' | 'audio' | 'moderation' | 'other';

/**
 * LLM Models（模型定义池）
 * - providerCode：归属的服务商（与 llm_providers.code 对齐）
 * - requestPathSuffix：相对 provider baseUrl 的请求后缀；embedding 常用 `/embeddings` 或 `/embeddings/multimodal`
 */
@Entity('llm_models')
@Index(['providerCode', 'modelType'])
@Index(['providerCode', 'modelName', 'modelType'], { unique: true })
@Index(['isActive'])
export class LlmModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_code', type: 'varchar', length: 32 })
  providerCode: string;

  @Column({ name: 'model_name', type: 'varchar', length: 120 })
  modelName: string;

  @Column({ name: 'model_type', type: 'varchar', length: 24, default: 'chat' })
  modelType: LlmModelType;

  @Column({ name: 'request_path_suffix', type: 'varchar', length: 200, nullable: true })
  requestPathSuffix: string | null;

  /** model_type=embedding 时向量维度；为空则运行时按 1536 默认 */
  @Column({ name: 'embedding_dimensions', type: 'integer', nullable: true })
  embeddingDimensions: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

