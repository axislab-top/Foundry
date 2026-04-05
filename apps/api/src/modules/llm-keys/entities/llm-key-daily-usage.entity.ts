import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, JoinColumn, Unique } from 'typeorm';
import { LlmKey } from './llm-key.entity.js';

/**
 * key 在某一天的累计使用量，用于快速计算今日剩余配额
 */
@Entity('llm_key_daily_usage')
@Index(['llmKeyId', 'usageDate'])
@Unique(['llmKeyId', 'usageDate'])
export class LlmKeyDailyUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'llm_key_id', type: 'uuid' })
  llmKeyId: string;

  @Column({ name: 'usage_date', type: 'date' })
  usageDate: string; // YYYY-MM-DD

  @Column({ name: 'used_tokens', type: 'bigint', default: 0 })
  usedTokens: string;

  @ManyToOne(() => LlmKey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'llm_key_id' })
  llmKey: LlmKey;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

