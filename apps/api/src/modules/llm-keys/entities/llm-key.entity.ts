import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type LlmKeyProvider = 'openai' | 'anthropic' | 'azure' | string;

/**
 * LLM Keys（大模型 Key 池）密钥主表
 * - secret 以加密密文形式存储，避免明文泄露
 */
@Entity('llm_keys')
@Index(['provider', 'modelName'])
@Index(['isActive'])
@Index(['keyAlias'])
export class LlmKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  provider: LlmKeyProvider;

  @Column({ name: 'model_name', type: 'varchar', length: 120 })
  modelName: string;

  @Column({ name: 'key_alias', type: 'varchar', length: 120 })
  keyAlias: string;

  @Column({ name: 'encrypted_secret', type: 'text' })
  encryptedSecret: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'daily_quota_tokens', type: 'bigint', default: 0 })
  dailyQuotaTokens: string;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

