import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type LlmProviderKind = 'openai' | 'anthropic';

/**
 * LLM Providers（大模型服务商）
 * - requestUrl：服务商的 API base URL / endpoint（LangChain baseURL 用）
 */
@Entity('llm_providers')
@Index(['code'])
@Index(['kind'])
export class LlmProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120, default: '' })
  displayName: string;

  @Column({ name: 'kind', type: 'varchar', length: 16, default: 'openai' })
  kind: LlmProviderKind;

  @Column({ name: 'request_url', type: 'text' })
  requestUrl: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

