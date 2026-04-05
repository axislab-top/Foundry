import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 审计日志实体
 */
@Entity('audit_logs')
@Index(['userId'])
@Index(['companyId'])
@Index(['service'])
@Index(['method', 'path'])
@Index(['statusCode'])
@Index(['createdAt'])
export class AuditLog {
  /**
   * 主键ID
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 请求ID
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'request_id' })
  requestId: string | null;

  /**
   * 用户ID（如果有）
   */
  @Column({ type: 'uuid', nullable: true, name: 'user_id' })
  userId: string | null;

  /**
   * 公司ID（租户上下文）
   */
  @Column({ type: 'uuid', nullable: true, name: 'company_id' })
  companyId: string | null;

  /**
   * API密钥ID（如果有）
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'api_key_id' })
  apiKeyId: string | null;

  /**
   * 服务名称（api, webhooks, worker等）
   */
  @Column({ type: 'varchar', length: 50 })
  service: string;

  /**
   * HTTP方法
   */
  @Column({ type: 'varchar', length: 10 })
  method: string;

  /**
   * 请求路径
   */
  @Column({ type: 'varchar', length: 500 })
  path: string;

  /**
   * 状态码
   */
  @Column({ type: 'int', name: 'status_code' })
  statusCode: number;

  /**
   * 请求头（JSON，已脱敏）
   */
  @Column({ type: 'jsonb', nullable: true, name: 'request_headers' })
  requestHeaders: Record<string, string> | null;

  /**
   * 请求体（JSON，已脱敏，仅记录部分）
   */
  @Column({ type: 'text', nullable: true, name: 'request_body' })
  requestBody: string | null;

  /**
   * 响应体（JSON，已脱敏，仅记录错误）
   */
  @Column({ type: 'text', nullable: true, name: 'response_body' })
  responseBody: string | null;

  /**
   * 客户端IP
   */
  @Column({ type: 'varchar', length: 45, nullable: true, name: 'client_ip' })
  clientIp: string | null;

  /**
   * User-Agent
   */
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'user_agent' })
  userAgent: string | null;

  /**
   * 请求持续时间（毫秒）
   */
  @Column({ type: 'int', nullable: true, name: 'duration_ms' })
  durationMs: number | null;

  /**
   * 错误信息（如果有）
   */
  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage: string | null;

  /**
   * 创建时间
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}


































