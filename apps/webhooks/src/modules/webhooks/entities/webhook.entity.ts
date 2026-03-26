import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

/**
 * Webhook 配置实体
 */
@Entity('webhooks')
@Index(['name'], { unique: true })
export class Webhook {
  /**
   * 主键ID (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Webhook 名称
   */
  @Column({ type: 'varchar', length: 255, unique: true, comment: 'Webhook 名称' })
  name: string;

  /**
   * 描述
   */
  @Column({ type: 'text', nullable: true, comment: '描述' })
  description: string | null;

  /**
   * 目标 URL
   */
  @Column({ type: 'varchar', length: 500, comment: '目标 URL' })
  url: string;

  /**
   * 事件列表（JSON数组）
   */
  @Column({
    type: 'jsonb',
    default: [],
    comment: '事件列表',
  })
  events: string[];

  /**
   * 签名密钥（用于验证请求）
   */
  @Column({ type: 'varchar', length: 255, nullable: true, comment: '签名密钥' })
  secret: string | null;

  /**
   * 是否启用
   */
  @Column({ type: 'boolean', default: true, comment: '是否启用' })
  enabled: boolean;

  /**
   * 重试次数
   */
  @Column({ type: 'integer', default: 3, comment: '重试次数' })
  retryCount: number;

  /**
   * 超时时间（毫秒）
   */
  @Column({ type: 'integer', default: 30000, comment: '超时时间（毫秒）' })
  timeout: number;

  /**
   * 创建时间
   */
  @CreateDateColumn({ type: 'timestamp', comment: '创建时间' })
  createdAt: Date;

  /**
   * 更新时间
   */
  @UpdateDateColumn({ type: 'timestamp', comment: '更新时间' })
  updatedAt: Date;

  /**
   * 删除时间（软删除）
   */
  @DeleteDateColumn({ type: 'timestamp', nullable: true, comment: '删除时间' })
  deletedAt: Date | null;
}
