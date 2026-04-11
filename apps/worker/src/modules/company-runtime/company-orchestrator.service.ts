import { Injectable } from '@nestjs/common';
import { AutonomousOrchestratorService } from '../autonomous/autonomous-orchestrator.service.js';
import {
  CeoHeartbeatRunCoordinatorOptions,
  CeoHeartbeatTriggerSource,
} from '../tasks/ceo-heartbeat-run-coordinator.service.js';
import type { TaskBreakdownRequestedEvent } from '@contracts/events';
import type { BudgetApprovalStatusDecision } from './approval/dto/approval-status-changed.dto.js';
import { ApprovalGateService } from './approval/approval-gate.service.js';
import { CompanyReviewService } from './review-plan-act-report/company-review.service.js';
import { CompanyPlannerService } from './review-plan-act-report/company-planner.service.js';
import { CompanyActorService } from './review-plan-act-report/company-actor.service.js';
import { CompanyReporterService } from './review-plan-act-report/company-reporter.service.js';
import { CompanyStateService } from './company-state.service.js';
import { CompanyCortexService } from './company-cortex.service.js';
import type { CompanyHeartbeatContext, CompanyStuckTaskSignal } from './dto/company-heartbeat-context.dto.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';
import { Inject, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';

@Injectable()
export class CompanyOrchestratorService {
  private readonly logger = new Logger(CompanyOrchestratorService.name);

  constructor(
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    private readonly autonomous: AutonomousOrchestratorService,
    private readonly approvalGate: ApprovalGateService,
    private readonly reviewService: CompanyReviewService,
    private readonly plannerService: CompanyPlannerService,
    private readonly actorService: CompanyActorService,
    private readonly reporterService: CompanyReporterService,
    private readonly stateService: CompanyStateService,
    private readonly cortex: CompanyCortexService,
    private readonly monitoring: MonitoringService,
  ) {}

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }

  private async handleStuckTasks(companyId: string, stuckTasks: CompanyStuckTaskSignal[]): Promise<void> {
    if (!stuckTasks.length) return;
    const actor = this.actor();
    const maxRetries = this.config.getCompanyStuckMaxSelfMentionRetries();
    for (const task of stuckTasks) {
      if (task.possibleCause !== 'self_mention_loop') continue;
      try {
        const detail = await this.rpc<{ id: string; metadata?: Record<string, unknown> | null; status?: string }>(
          'tasks.findOne',
          { companyId, actor, id: task.id },
        );
        const metadata = (detail?.metadata ?? {}) as Record<string, unknown>;
        const retries = typeof metadata.selfMentionRecoveryRetries === 'number' ? metadata.selfMentionRecoveryRetries : 0;
        if (retries >= maxRetries) continue;
        await this.rpc('tasks.update', {
          companyId,
          actor,
          id: task.id,
          data: {
            status: detail?.status === 'blocked' ? 'pending' : detail?.status,
            blockedReason: '',
            metadata: {
              ...metadata,
              selfMentionRecoveryRetries: retries + 1,
              selfMentionRecoveredAt: new Date().toISOString(),
            },
          },
        });
      } catch (e: unknown) {
        this.logger.warn('company heartbeat stuck-task recovery failed', {
          companyId,
          taskId: task.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  async runHeartbeat(params: {
    companyId: string;
    tickAt: string;
    triggerSource: CeoHeartbeatTriggerSource;
    options?: CeoHeartbeatRunCoordinatorOptions;
  }): Promise<{ runId: string }> {
    const ctx: CompanyHeartbeatContext = {
      companyId: params.companyId,
      tickAt: params.tickAt,
      triggerSource: params.triggerSource,
      options: params.options ?? {},
    };
    try {
      const snapshot = await this.stateService.captureSnapshot(ctx);
      const strategicContext = await this.cortex.getStrategicContext(ctx);
      const reviewResult = await this.reviewService.reviewCompany(snapshot, strategicContext);
      if (reviewResult.stuckTasks.length > 0) {
        await this.handleStuckTasks(ctx.companyId, reviewResult.stuckTasks);
      }
      const plan = await this.plannerService.generateNextPlan(reviewResult, snapshot);
      const shouldEnterEmergencyRecovery =
        reviewResult.stuckTasks.length >= this.config.getCompanyStuckEmergencyThreshold();
      if (shouldEnterEmergencyRecovery) {
        this.logger.warn('company heartbeat enters emergency recovery gate', {
          companyId: ctx.companyId,
          stuckTasks: reviewResult.stuckTasks.length,
          triggerSource: ctx.triggerSource,
        });
      }
      const execution = shouldEnterEmergencyRecovery
        ? {
            runId: `recovery-${Date.now()}`,
            dispatchedActions: [] as string[],
          }
        : await this.actorService.executePlan(ctx, plan);
      await this.reporterService.generateAndPublishReport({
        context: ctx,
        review: reviewResult,
        plan,
        execution,
      });
      await this.stateService.updateSnapshot(ctx, reviewResult, plan);
      this.monitoring.incCompanyHeartbeatLifecycle('completed', params.triggerSource);
      return { runId: execution.runId };
    } catch (e: unknown) {
      this.monitoring.incCompanyHeartbeatLifecycle('failed', params.triggerSource);
      throw e;
    }
  }

  async runBreakdown(event: TaskBreakdownRequestedEvent): Promise<void> {
    // TODO: P8 必须迁移到 runner.execute RPC（当前仍为临时路径：经 AutonomousOrchestrator → LangGraph）
    await this.autonomous.runBreakdown(event);
  }

  async processApprovalDecision(event: BudgetApprovalStatusDecision): Promise<void> {
    await this.approvalGate.processDecision(event);
  }
}
