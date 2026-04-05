import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '@service/messaging';
import { TenantModule } from '@service/tenant';
import { Company } from '../companies/entities/company.entity.js';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { ApprovalInternalController } from './approval-internal.controller.js';
import { ApprovalRpcController } from './approval.rpc.controller.js';
import { ApprovalAuditLog } from './entities/approval-audit-log.entity.js';
import { ApprovalExecutionToken } from './entities/approval-execution-token.entity.js';
import { ApprovalRequest } from './entities/approval-request.entity.js';
import { ApprovalRedisMirrorService } from './services/approval-redis-mirror.service.js';
import { ApprovalService } from './services/approval.service.js';
import { ApprovalTemporalBridgeService } from './services/approval-temporal-bridge.service.js';
import { ApprovalMetricsService } from './services/approval-metrics.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApprovalRequest,
      ApprovalAuditLog,
      ApprovalExecutionToken,
      Company,
    ]),
    TenantModule,
    MessagingModule,
    CollaborationModule,
  ],
  controllers: [ApprovalRpcController, ApprovalInternalController],
  providers: [ApprovalService, ApprovalTemporalBridgeService, ApprovalRedisMirrorService, ApprovalMetricsService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
