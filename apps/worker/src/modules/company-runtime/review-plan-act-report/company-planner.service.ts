import { Injectable } from '@nestjs/common';
import { CeoRuntimeOrchestratorService } from '../../autonomous/ceo-runtime-orchestrator.service.js';
import type {
  CompanyPlan,
  CompanyReviewResult,
  CompanyStateSnapshot,
} from '../dto/company-heartbeat-context.dto.js';

@Injectable()
export class CompanyPlannerService {
  constructor(private readonly ceoRuntime: CeoRuntimeOrchestratorService) {}

  async generateNextPlan(
    review: CompanyReviewResult,
    snapshot: CompanyStateSnapshot,
  ): Promise<CompanyPlan> {
    const dispatchMode =
      review.healthScore >= 85 ? 'aggressive' : review.healthScore >= 65 ? 'balanced' : 'conservative';
    const goal = [
      `Company heartbeat planning for ${snapshot.companyName}.`,
      `healthScore=${review.healthScore}.`,
      `pendingApprovals=${snapshot.approvals.pending}, blockedTasks=${snapshot.tasks.blocked}.`,
      `Focus: ${review.focusAreas.join('; ') || 'stabilize execution'}.`,
    ].join(' ');
    const plannerResult = await this.ceoRuntime
      .orchestrateGoal({
        companyId: snapshot.companyId,
        goal,
        currentAgentId: 'company-runtime-ceo',
        traceId: `company-plan:${snapshot.companyId}:${snapshot.tickAt}`,
        inputs: {
          review,
          taskSummary: snapshot.tasks,
          budgetSummary: snapshot.budget,
          recommendations: review.recommendations,
        },
      })
      .catch(() => null);
    const plannerNotes = plannerResult?.success
      ? 'ceo_runtime_orchestrator=success'
      : 'ceo_runtime_orchestrator=fallback';
    return {
      dispatchMode,
      nextActions: [
        `review company health score=${review.healthScore}`,
        `stabilize approvals backlog=${snapshot.approvals.pending}`,
        'dispatch next autonomous work batch',
      ],
      plannerNotes,
    };
  }
}
