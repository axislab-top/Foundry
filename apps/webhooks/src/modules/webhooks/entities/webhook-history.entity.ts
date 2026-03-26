import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Webhook } from './webhook.entity.js';

/**
 * Webhook 历史记录实体
 */
@Entity('webhook_history')
@Index(['webhookId'])
@Index(['status'])
@Index(['createdAt'])
export class WebhookHistory {
  /**
   * 主键ID (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Webhook ID
   */
  @Column({ type: 'uuid', comment: 'Webhook ID' })
  webhookId: string;

  /**
   * Webhook 关联
   */
  @ManyToOne(() => Webhook)
  @JoinColumn({ name: 'webhookId' })
  webhook: Webhook;

  /**
   * 事件类型
   */
  @Column({ type: 'varchar', length: 100, comment: '事件类型' })
  event: string;

  /**
   * 请求体（JSON）
   */
  @Column({ type: 'jsonb', nullable: true, comment: '请求体' })
  payload: any;

  /**
   * 状态
   */
  @Column({
    type: 'varchar',
    length: 50,
    comment: '状态: pending, success, failed',
  })
  status: 'pending' | 'success' | 'failed';

  /**
   * HTTP 状态码
   */
  @Column({ type: 'integer', nullable: true, comment: 'HTTP 状态码' })
  statusCode: number | null;

  /**
   * 响应体（JSON）
   */
  @Column({ type: 'jsonb', nullable: true, comment: '响应体' })
  response: any;

  /**
   * 错误信息
   */
  @Column({ type: 'text', nullable: true, comment: '错误信息' })
  error: string | null;

  /**
   * 重试次数
   */
  @Column({ type: 'integer', default: 0, comment: '重试次数' })
  retryCount: number;

  /**
   * 执行时间（毫秒）
   */
  @Column({ type: 'integer', nullable: true, comment: '执行时间（毫秒）' })
  duration: number | null;

  /**
   * 创建时间
   */
  @CreateDateColumn({ type: 'timestamp', comment: '创建时间' })
  createdAt: Date;
}
