import { Injectable, Logger } from '@nestjs/common';
import { TenantContextService } from '@service/tenant';
import { COLLAB_LLM_TRACE } from '../../../common/logging/collab-llm-trace.util.js';
import { L1FeatureFlagService } from './l1-feature-flag.service.js';

export type L1TemporalPrewarmInput = {
  companyId: string;
  roomId: string;
  messageId: string;
  waitingForAgentIds: string[];
  route: 'idle-confirm' | 'draft-mention' | 'confirmed-execution';
};

export type L1TemporalPrewarmResult = {
  started: boolean;
  status: 'disabled' | 'noop' | 'scheduled';
  waitMs: number;
  nextCheckpointAt?: string;
};

/**
 * Phase-3 placeholder workflow service:
 * - Encapsulates long-wait state transitions for idle-confirm / waitingForAgentIds.
 * - Keeps zero-break behavior by being fully flag-gated.
 * - Can be migrated to dedicated Temporal Worker activities without changing callers.
 */
@Injectable()
export class L1TemporalPrewarmWorkflow {
  private readonly logger = new Logger(L1TemporalPrewarmWorkflow.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly l1FeatureFlag: L1FeatureFlagService,
  ) {}

  async start(input: L1TemporalPrewarmInput): Promise<L1TemporalPrewarmResult> {
    return this.tenantContext.runWithCompanyId(input.companyId, async () => {
      const enabled = await this.l1FeatureFlag.isTemporalPrewarmEnabled(input.companyId);
      if (!enabled) {
        return { started: false, status: 'disabled', waitMs: 0 };
      }
      const waiting = (input.waitingForAgentIds ?? []).filter(Boolean);
      if (!waiting.length || input.route !== 'idle-confirm') {
        return { started: false, status: 'noop', waitMs: 0 };
      }

      // Keep initial interval small; orchestration infra can repeatedly re-enqueue/checkpoint.
      const waitMs = 30 * 60 * 1000;
      const nextCheckpointAt = new Date(Date.now() + waitMs).toISOString();
      this.logger.log(`${COLLAB_LLM_TRACE} | l1.temporal_prewarm_scheduled`, {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        waitingForAgentIds: waiting,
        waitMs,
        nextCheckpointAt,
      });
      return {
        started: true,
        status: 'scheduled',
        waitMs,
        nextCheckpointAt,
      };
    });
  }
}
