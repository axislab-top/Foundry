import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

/**
 * 第三方账号实体
 */
@Entity('oauth_accounts')
@Index(['provider', 'providerUserId'], { unique: true })
export class OAuthAccount {
  /**
   * 主键ID (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 关联的用户ID
   */
  @Column({ type: 'uuid', comment: '用户ID' })
  userId: string;

  /**
   * 第三方平台提供商 (wechat, qq, github 等)
   */
  @Column({ type: 'varchar', length: 50, comment: '第三方平台提供商' })
  provider: string;

  /**
   * 第三方平台的用户ID (openid)
   */
  @Column({ type: 'varchar', length: 255, comment: '第三方平台的用户ID' })
  providerUserId: string;

  /**
   * 第三方平台的用户名/昵称
   */
  @Column({ type: 'varchar', length: 255, nullable: true, comment: '第三方平台的用户名' })
  providerUsername: string | null;

  /**
   * 访问令牌（可选，用于后续API调用）
   */
  @Column({ type: 'text', nullable: true, comment: '访问令牌' })
  accessToken: string | null;

  /**
   * 刷新令牌（可选）
   */
  @Column({ type: 'text', nullable: true, comment: '刷新令牌' })
  refreshToken: string | null;

  /**
   * Token过期时间
   */
  @Column({ type: 'timestamp', nullable: true, comment: 'Token过期时间' })
  expiresAt: Date | null;

  /**
   * 第三方平台的用户信息（完整profile）
   */
  @Column({ type: 'jsonb', nullable: true, comment: '第三方平台的用户信息' })
  profileData: Record<string, any> | null;

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
   * 关联的用户实体
   */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}



































