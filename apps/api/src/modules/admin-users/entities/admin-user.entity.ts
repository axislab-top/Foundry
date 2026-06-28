import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index
} from 'typeorm';

@Entity('admin_users')
@Index(['email'], { unique: true })
@Index(['username'], { unique: true })
export class AdminUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true, comment: '管理员用户名' })
  username: string;

  @Column({ type: 'varchar', length: 255, unique: true, comment: '管理员邮箱' })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, comment: '密码哈希' })
  passwordHash: string;

  @Column({ type: 'jsonb', default: ['admin'], comment: '管理员角色列表' })
  roles: string[];

  @Column({ type: 'jsonb', default: [], comment: '管理员权限列表' })
  permissions: string[];

  @Column({ type: 'boolean', default: true, comment: '是否启用' })
  enabled: boolean;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true, comment: '最后登录时间' })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', comment: '更新时间' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true, comment: '删除时间' })
  deletedAt: Date | null;
}
