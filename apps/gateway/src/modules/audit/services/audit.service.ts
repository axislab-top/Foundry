import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity.js';
import type { GatewayRequest } from '../../common/types/gateway-request.type.js';

/**
 * 审计日志服务
 * 记录请求日志、脱敏、查询
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  // 敏感字段（需要脱敏）
  private readonly SENSITIVE_FIELDS = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'cookie',
    'credit',
    'card',
    'ssn',
    'email',
  ];

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * 记录审计日志
   */
  async log(
    request: GatewayRequest,
    response: any,
    service: string,
    durationMs: number,
    error?: Error,
  ): Promise<void> {
    try {
      const auditLog = this.auditLogRepository.create({
        requestId: request.requestId,
        userId: request.user?.id || null,
        companyId: this.extractCompanyId(request),
        apiKeyId: request.apiKey?.keyId || null,
        service,
        method: request.method,
        path: request.path || request.url,
        statusCode: response?.statusCode || 500,
        requestHeaders: this.maskHeaders(request.headers),
        requestBody: this.maskBody(request.body),
        responseBody: error || (response?.statusCode >= 400 ? this.maskBody(response?.body) : null),
        clientIp: this.extractClientIp(request),
        userAgent: request.headers['user-agent'] || null,
        durationMs,
        errorMessage: error?.message || null,
      });

      await this.auditLogRepository.save(auditLog);
    } catch (err) {
      // 审计日志记录失败不应影响主流程
      this.logger.error('Failed to log audit:', err);
    }
  }

  /**
   * 查询审计日志
   */
  async query(options: {
    userId?: string;
    companyId?: string;
    apiKeyId?: string;
    service?: string;
    method?: string;
    path?: string;
    statusCode?: number;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: AuditLog[]; total: number; page: number; pageSize: number }> {
    const {
      userId,
      companyId,
      apiKeyId,
      service,
      method,
      path,
      statusCode,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = options;

    const where: FindOptionsWhere<AuditLog> = {};

    if (userId) where.userId = userId;
    if (companyId) where.companyId = companyId;
    if (apiKeyId) where.apiKeyId = apiKeyId;
    if (service) where.service = service;
    if (method) where.method = method.toUpperCase();
    if (statusCode) where.statusCode = statusCode;
    if (path) where.path = path;

    const queryBuilder = this.auditLogRepository.createQueryBuilder('audit_log');

    if (Object.keys(where).length > 0) {
      queryBuilder.where(where);
    }

    if (startDate) {
      queryBuilder.andWhere('audit_log.created_at >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('audit_log.created_at <= :endDate', { endDate });
    }

    if (path && !where.path) {
      queryBuilder.andWhere('audit_log.path LIKE :path', { path: `%${path}%` });
    }

    const total = await queryBuilder.getCount();

    const items = await queryBuilder
      .orderBy('audit_log.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 脱敏请求头
   */
  private maskHeaders(headers: any): Record<string, string> | null {
    if (!headers) return null;

    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (this.isSensitiveField(lowerKey)) {
        masked[key] = '***MASKED***';
      } else {
        masked[key] = String(value).substring(0, 500); // 限制长度
      }
    }
    return masked;
  }

  /**
   * 脱敏请求/响应体
   */
  private maskBody(body: any): string | null {
    if (!body) return null;

    try {
      // 如果是字符串，尝试解析为JSON
      let data = typeof body === 'string' ? JSON.parse(body) : body;

      // 递归脱敏
      data = this.maskObject(data);

      // 序列化并限制长度
      const serialized = JSON.stringify(data);
      return serialized.length > 10000 ? serialized.substring(0, 10000) + '...' : serialized;
    } catch {
      // 如果不是JSON，直接返回字符串（限制长度）
      const str = String(body);
      return str.length > 10000 ? str.substring(0, 10000) + '...' : str;
    }
  }

  /**
   * 递归脱敏对象
   */
  private maskObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.maskObject(item));
    }

    if (typeof obj === 'object') {
      const masked: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (this.isSensitiveField(lowerKey)) {
          masked[key] = '***MASKED***';
        } else if (typeof value === 'object') {
          masked[key] = this.maskObject(value);
        } else {
          masked[key] = value;
        }
      }
      return masked;
    }

    return obj;
  }

  /**
   * 判断是否为敏感字段
   */
  private isSensitiveField(key: string): boolean {
    return this.SENSITIVE_FIELDS.some((field) => key.includes(field));
  }

  /**
   * 提取客户端IP
   */
  private extractClientIp(request: any): string | null {
    return (
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.headers['x-real-ip'] ||
      request.ip ||
      request.connection?.remoteAddress ||
      null
    );
  }

  private extractCompanyId(request: any): string | null {
    const value =
      request?.companyId ||
      request?.headers?.['x-company-id'] ||
      request?.headers?.['X-Company-Id'] ||
      request?.user?.companyId ||
      null;
    return typeof value === 'string' ? value : null;
  }
}











