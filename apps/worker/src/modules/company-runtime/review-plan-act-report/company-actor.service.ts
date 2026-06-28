import { Injectable } from '@nestjs/common';
import { CeoHeartbeatRunCoordinatorService } from '../../tasks/ceo-heartbeat-run-coordinator.service.js';
import type {
  CompanyExecutionResult,
  CompanyHeartbeatContext,
  CompanyPlan,
} from '../dto/company-heartbeat-context.dto.js';

@Injectable()
export class CompanyActorService {
  constructor(private readonly heartbeatCoordinator: CeoHeartbeatRunCoordinatorService) {}

  async executePlan(ctx: CompanyHeartbeatContext, _plan: CompanyPlan): Promise<CompanyExecutionResult> {
    const { runId, completedTaskIds } = await this.heartbeatCoordinator.runCycle(
      ctx.companyId,
      ctx.tickAt,
      ctx.triggerSource,
      ctx.options ?? {},
    );
    return {
      runId,
      dispatchedActions: completedTaskIds,
    };
  }
}
