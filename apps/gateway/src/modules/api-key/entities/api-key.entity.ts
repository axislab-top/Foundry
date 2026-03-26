import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * API密钥实体
 */
@Entity('api_keys')
@Index(['keyId'], { unique: true })
@Index(['isActive'])
export class ApiKey {
  /**
   * 主键ID
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 密钥ID（用于标识，唯一）
   */
  @Column({ type: 'varchar', length: 64, unique: true, name: 'key_id' })
  keyId: string;

  /**
   * 密钥哈希（存储密钥的哈希值，不存储明文）
   */
  @Column({ type: 'varchar', length: 255, name: 'key_hash' })
  keyHash: string;

  /**
   * 密钥名称
   */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /**
   * 描述
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * 权限列表（JSON数组格式）
   */
  @Column({ type: 'jsonb', nullable: true })
  permissions: string[] | null;

  /**
   * 过期时间
   */
  @Column({ type: 'timestamp', nullable: true, name: 'expires_at' })
  expiresAt: Date | null;

  /**
   * 是否激活
   */
  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  /**
   * 创建时间
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * 更新时间
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

