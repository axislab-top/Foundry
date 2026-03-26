import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 动态路由实体
 */
@Entity('routes')
@Index(['path'], { unique: true })
@Index(['isActive'])
export class Route {
  /**
   * 主键ID
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 路由路径（支持通配符）
   */
  @Column({ type: 'varchar', length: 255, unique: true })
  path: string;

  /**
   * 目标服务（api, webhooks, worker）
   */
  @Column({ type: 'varchar', length: 50 })
  service: string;

  /**
   * 路径重写规则（可选）
   */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'rewrite_path' })
  rewritePath: string | null;

  /**
   * 路由传输方式（http / rpc）
   */
  @Column({ type: 'varchar', length: 16, default: 'http' })
  transport: 'http' | 'rpc';

  /**
   * RPC client 名称（例如 api）
   */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'rpc_client_name' })
  rpcClientName: string | null;

  /**
   * RPC pattern（例如 auth.validate）
   */
  @Column({ type: 'varchar', length: 128, nullable: true, name: 'rpc_pattern' })
  rpcPattern: string | null;

  /**
   * RPC timeout（毫秒）
   */
  @Column({ type: 'int', nullable: true, name: 'rpc_timeout_ms' })
  rpcTimeoutMs: number | null;

  /**
   * 是否需要认证
   */
  @Column({ type: 'boolean', default: true, name: 'auth_required' })
  authRequired: boolean;

  /**
   * 是否激活
   */
  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  /**
   * 优先级（数字越大优先级越高）
   */
  @Column({ type: 'int', default: 0 })
  priority: number;

  /**
   * 路由描述
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

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























