import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../services/audit.service.js';
import { QueryAuditLogDto } from '../dto/query-audit-log.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';

/**
 * 审计日志控制器
 */
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * 查询审计日志
   * GET /api/admin/audit-logs
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async query(@Query() queryDto: QueryAuditLogDto) {
    const {
      userId,
      apiKeyId,
      service,
      method,
      path,
      statusCode,
      startDate,
      endDate,
      page,
      pageSize,
    } = queryDto;

    return this.auditService.query({
      userId,
      apiKeyId,
      service,
      method,
      path,
      statusCode,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page,
      pageSize,
    });
  }
}











