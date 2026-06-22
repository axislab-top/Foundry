import { Module } from '@nestjs/common';
import { CompanyOrchestratorService } from './company-orchestrator.service.js';
import { ApprovalGateService } from './approval/approval-gate.service.js';
import { CompanyReviewService } from './review-plan-act-report/company-review.service.js';
import { CompanyPlannerService } from './review-plan-act-report/company-planner.service.js';
import { CompanyActorService } from './review-plan-act-report/company-actor.service.js';
import { CompanyReporterService } from './review-plan-act-report/company-reporter.service.js';
import { CompanyStateService } from './company-state.service.js';
import { CompanyCortexService } from './company-cortex.service.js';

/**
 * Company Runtime Module
 *
 * Provides the CompanyOrchestratorService which coordinates
 * company-level operations like heartbeats, breakdowns, and approvals.
 */
@Module({
  providers: [
    CompanyOrchestratorService,
    ApprovalGateService,
    CompanyReviewService,
    CompanyPlannerService,
    CompanyActorService,
    CompanyReporterService,
    CompanyStateService,
    CompanyCortexService,
  ],
  exports: [CompanyOrchestratorService],
})
export class CompanyRuntimeModule {}
