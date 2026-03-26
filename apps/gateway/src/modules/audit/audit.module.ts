import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity.js';
import { AuditService } from './services/audit.service.js';
import { AuditInterceptor } from './interceptors/audit.interceptor.js';
import { AuditController } from './controllers/audit.controller.js';
import { AuthModule } from '../auth/auth.module.js';

/**
 * 审计模块
 * 提供审计日志记录和查询功能
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), AuthModule],
  providers: [AuditService, AuditInterceptor],
  controllers: [AuditController],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}


































