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
 * 用户实体
 */
@Entity('users')
@Index(['email'], { unique: true })
@Index(['username'], { unique: true })
export class User {
  /**
   * 主键ID (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 用户名
   */
  @Column({ type: 'varchar', length: 100, unique: true, comment: '用户名' })
  username: string;

  /**
   * 邮箱
   */
  @Column({ type: 'varchar', length: 255, unique: true, comment: '邮箱' })
  email: string;

  /**
   * 密码哈希
   */
  @Column({ type: 'varchar', length: 255, comment: '密码哈希' })
  passwordHash: string;

  /**
   * 是否启用
   */
  @Column({ type: 'boolean', default: true, comment: '是否启用' })
  enabled: boolean;

  /**
   * 最后登录时间
   */
  @Column({ type: 'timestamp', nullable: true, comment: '最后登录时间' })
  lastLoginAt: Date | null;

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





































