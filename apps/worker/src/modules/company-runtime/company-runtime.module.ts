import { Module } from '@nestjs/common';
import { AutonomousModule } from '../autonomous/autonomous.module.js';
import { TasksWorkerModule } from '../tasks/tasks-worker.module.js';
import { CompanyOrchestratorService } from './company-orchestrator.service.js';
import { ApprovalEventHandler } from './approval/approval-event.handler.js';
import { ApprovalGateService } from './approval/approval-gate.service.js';
import { CompanyStateService } from './company-state.service.js';
import { CompanyCortexService } from './company-cortex.service.js';
import { CompanyReviewService } from './review-plan-act-report/company-review.service.js';
import { CompanyPlannerService } from './review-plan-act-report/company-planner.service.js';
import { CompanyActorService } from './review-plan-act-report/company-actor.service.js';
import { CompanyReporterService } from './review-plan-act-report/company-reporter.service.js';
import { DepartmentEscalationForcedListener } from './listeners/department-escalation-forced.listener.js';
import { GovernanceCommandBusService } from './governance/governance-command-bus.service.js';
import { BossGovernanceAggregatorListener } from './governance/boss-governance-aggregator.listener.js';
import { OrganizationEvolutionEngine } from './evolution/organization-evolution.engine.js';
import { RolePersonalityEngine } from './personality/role-personality.engine.js';
import { HeartbeatEscalationDeciderService } from './heartbeat-escalation-decider.service.js';

@Module({
  imports: [AutonomousModule, TasksWorkerModule],
  providers: [
    CompanyOrchestratorService,
    ApprovalGateService,
    ApprovalEventHandler,
    CompanyStateService,
    CompanyCortexService,
    CompanyReviewService,
    CompanyPlannerService,
    CompanyActorService,
    CompanyReporterService,
    GovernanceCommandBusService,
    BossGovernanceAggregatorListener,
    OrganizationEvolutionEngine,
    RolePersonalityEngine,
    DepartmentEscalationForcedListener,
    HeartbeatEscalationDeciderService,
  ],
  exports: [CompanyOrchestratorService, GovernanceCommandBusService, RolePersonalityEngine],
})
export class CompanyRuntimeModule {}
