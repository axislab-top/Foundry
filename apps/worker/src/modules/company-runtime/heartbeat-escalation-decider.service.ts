import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';
import { CompanyExecutionCoordinationService } from '../../common/coordination/company-execution-coordination.service.js';
import type { CompanyReviewResult, CompanyStateSnapshot } from './dto/company-heartbeat-context.dto.js';
import { computeHeartbeatStateFingerprint } from './heartbeat-fingerprint.util.js';

export type HeartbeatCeoGraphTier = 'cheap' | 'full';

export type HeartbeatEscalationDecision = {
  tier: HeartbeatCeoGraphTier;
  reason: string;
  fingerprint: string;
};

@Injectable()
export class HeartbeatEscalationDeciderService {
  constructor(
    private readonly config: ConfigService,
    private readonly coordination: CompanyExecutionCoordinationService,
  ) {}

  async decide(params: {
    companyId: string;
    review: CompanyReviewResult;
    snapshot: CompanyStateSnapshot;
  }): Promise<HeartbeatEscalationDecision> {
    const fingerprint = computeHeartbeatStateFingerprint(params.snapshot);

    if (!this.config.isHeartbeatTieredCeoGraphEnabled()) {
      return { tier: 'full', reason: 'tiered_disabled', fingerprint };
    }

    if (params.review.stuckTasks.length > 0) {
      return { tier: 'full', reason: 'stuck_tasks', fingerprint };
    }
    if (params.snapshot.tasks.blocked > 0) {
      return { tier: 'full', reason: 'blocked_tasks', fingerprint };
    }
    if (params.snapshot.approvals.pending > 0) {
      return { tier: 'full', reason: 'pending_approvals', fingerprint };
    }
    if (params.review.healthScore < this.config.getHeartbeatSteadyHealthMin()) {
      return { tier: 'full', reason: 'low_health', fingerprint };
    }

    const lastFingerprint = await this.coordination.getHeartbeatFingerprint(params.companyId);
    if (lastFingerprint && lastFingerprint !== fingerprint) {
      return { tier: 'full', reason: 'fingerprint_changed', fingerprint };
    }

    const lastFullAt = await this.coordination.getLastFullGraphAt(params.companyId);
    const forceMs = this.config.getCeoLlmPlanForceIntervalMs();
    if (!lastFullAt || Date.now() - lastFullAt >= forceMs) {
      return { tier: 'full', reason: 'force_interval', fingerprint };
    }

    return { tier: 'cheap', reason: 'steady_state', fingerprint };
  }
}
