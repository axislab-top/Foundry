import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createRequire } from 'node:module';
import { MessagingModule } from '@service/messaging';
import { TenantModule } from '@service/tenant';
import { Company } from '../companies/entities/company.entity.js';
import { CompanyRuntimePreferenceModule } from '../companies/company-runtime-preference.module.js';

const require = createRequire(import.meta.url);
import { ApprovalInternalController } from './approval-internal.controller.js';
import { ApprovalRpcController } from './approval.rpc.controller.js';
import { ApprovalAuditLog } from './entities/approval-audit-log.entity.js';
import { ApprovalExecutionToken } from './entities/approval-execution-token.entity.js';
import { ApprovalRequest } from './entities/approval-request.entity.js';
import { ApprovalFlowEntity } from './entities/approval-flow.entity.js';
import { BoardDecision } from './entities/board-decision.entity.js';
import { PolicyVersion } from './entities/policy-version.entity.js';
import { PolicyAuditLog } from './entities/policy-audit-log.entity.js';
import { ApprovalRedisMirrorService } from './services/approval-redis-mirror.service.js';
import { ApprovalResultPubSubService } from './services/approval-result-pubsub.service.js';
import { ApprovalService } from './services/approval.service.js';
import { ApprovalTemporalBridgeService } from './services/approval-temporal-bridge.service.js';
import { ApprovalMetricsService } from './services/approval-metrics.service.js';
import { PolicyVersionService } from './services/policy-version.service.js';
import { PolicyAuditService } from './services/policy-audit.service.js';
import { BoardDecisionService } from './services/board-decision.service.js';
import { ApprovalFlowStoreService } from './services/approval-flow-store.service.js';
import { ApprovalFlowApprovalPortService } from './services/approval-flow-approval-port.service.js';
import { ApprovalFlowRuntimeService } from './services/approval-flow-runtime.service.js';
import { SkillBindingApprovalListener } from './listeners/skill-binding-approval.listener.js';
import { SkillMarketplacePurchaseApprovalListener } from './listeners/skill-marketplace-purchase-approval.listener.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApprovalRequest,
      ApprovalAuditLog,
      ApprovalExecutionToken,
      ApprovalFlowEntity,
      BoardDecision,
      PolicyVersion,
      PolicyAuditLog,
      Company,
    ]),
    TenantModule,
    MessagingModule,
    CompanyRuntimePreferenceModule,
    forwardRef(() => require('../collaboration/collaboration.module.js').CollaborationModule),
    forwardRef(() => require('../agents/agents.module.js').AgentsModule),
    forwardRef(() => require('../templates/templates.module.js').TemplatesModule),
  ],
  controllers: [ApprovalRpcController, ApprovalInternalController],
  providers: [
    ApprovalService,
    ApprovalTemporalBridgeService,
    ApprovalRedisMirrorService,
    ApprovalMetricsService,
    ApprovalResultPubSubService,
    PolicyVersionService,
    PolicyAuditService,
    BoardDecisionService,
    ApprovalFlowStoreService,
    ApprovalFlowApprovalPortService,
    ApprovalFlowRuntimeService,
    SkillBindingApprovalListener,
    SkillMarketplacePurchaseApprovalListener,
  ],
  exports: [
    ApprovalService,
    ApprovalResultPubSubService,
    PolicyVersionService,
    PolicyAuditService,
    BoardDecisionService,
    ApprovalFlowStoreService,
    ApprovalFlowApprovalPortService,
    ApprovalFlowRuntimeService,
  ],
})
export class ApprovalModule {}
