import { Injectable, Logger } from '@nestjs/common';
import { TenantContextService } from '@service/tenant';
import {
  CeoHeartbeatRunCoordinatorService,
  type TaskRunTriggerSourceForCycle,
} from '../tasks/ceo-heartbeat-run-coordinator.service.js';
import { PendingAgentTaskExecutionService } from '../tasks/pending-agent-tasks.service.js';

export type AutonomousEventTriggerSource = 'task_completed' | 'budget_warning';

/**
 * 路径 B：事件触发自治周期（task_runs + LangGraph + pending，不经 Company Review/Plan）。
 */
@Injectable()
export class AutonomousRunCoordinatorService {
  private readonly logger = new Logger(AutonomousRunCoordinatorService.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly heartbeatCoordinator: CeoHeartbeatRunCoordinatorService,
    private readonly pendingAgentTasks: PendingAgentTaskExecutionService,
  ) {}

  async runEventTriggeredCycle(params: {
    companyId: string;
    tickAt: string;
    triggerSource: AutonomousEventTriggerSource;
    triggerRef?: string;
  }): Promise<{ runId: string; completedTaskIds: string[] }> {
    const companyId = String(params.companyId ?? '').trim();
    if (!companyId) {
      throw new Error('companyId required');
    }
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        return await this.heartbeatCoordinator.executeCycleCore({
          companyId,
          tickAt: params.tickAt,
          taskRunTriggerSource: params.triggerSource as TaskRunTriggerSourceForCycle,
          autonomousTriggerSource: params.triggerSource,
          includeDirectorFanout: false,
          triggerRef: params.triggerRef,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('autonomous event run cycle failed', {
          companyId,
          triggerSource: params.triggerSource,
          message,
        });
        throw e;
      }
    });
  }

  /** breakdown 后仅补跑 pending（LangGraph 已由 runBreakdown 完成）。 */
  async runPendingAfterBreakdown(
    companyId: string,
    runId?: string,
  ): Promise<{ completedTaskIds: string[] }> {
    const id = String(companyId ?? '').trim();
    if (!id) return { completedTaskIds: [] };
    return this.tenantContext.runWithCompanyId(id, async () => {
      try {
        const pendingResult = await this.pendingAgentTasks.processPendingForCompany(id, runId?.trim() || undefined);
        return { completedTaskIds: pendingResult?.completedTaskIds ?? [] };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('processPendingForCompany after breakdown failed', { companyId: id, message });
        return { completedTaskIds: [] };
      }
    });
  }
}
