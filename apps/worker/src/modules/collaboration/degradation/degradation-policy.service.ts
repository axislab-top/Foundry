import { Injectable, Logger } from '@nestjs/common';
import { ResiliencePolicyService } from '../../../common/resilience/resilience-policy.service.js';
import { COLLAB_LLM_TRACE } from '../../../common/logging/collab-llm-trace.util.js';
import { ConfigService } from '../../../common/config/config.service.js';

export type DegradationNextMode = 'light' | 'light_structured' | 'diagnostic';

@Injectable()
export class DegradationPolicyService {
  private readonly logger = new Logger(DegradationPolicyService.name);

  constructor(
    private readonly resilience: ResiliencePolicyService,
    private readonly config: ConfigService,
  ) {}

  decideFallback(params: {
    flow: 'heavy' | 'autonomous_plan';
    companyId: string;
    messageId: string;
    traceId?: string;
    errorMessage?: string;
    postApprovalSilent?: boolean;
    stage?: string | null;
    partialMergeExecuted?: boolean;
    mergedDepartments?: string[];
  }): { nextMode: DegradationNextMode; reason: string } | null {
    const companyId = String(params.companyId ?? '').trim();
    const messageId = String(params.messageId ?? '').trim();
    if (!companyId || !messageId) return null;
    const normalizedError = String(params.errorMessage ?? '').toLowerCase();
    const traceId = String(params.traceId ?? messageId);
    const stage = String(params.stage ?? '').trim().toLowerCase();
    const partialMergeExecuted = Boolean(params.partialMergeExecuted);
    if (
      this.config.isHeavyForceStructuredOnPartialMergeEnabled() &&
      partialMergeExecuted &&
      stage === 'splitting_timeout_partial_merged'
    ) {
      this.logger.log(`${COLLAB_LLM_TRACE} | degradation.decide`, {
        traceId,
        flow: params.flow,
        companyId,
        messageId,
        stage,
        nextMode: 'light_structured',
        reason: 'partial_merge_forced_structured',
        mergedDepartments: (params.mergedDepartments ?? []).slice(0, 12),
      });
      return {
        nextMode: 'light_structured',
        reason: 'partial_merge_forced_structured',
      };
    }
    if (params.postApprovalSilent) {
      this.logger.log(`${COLLAB_LLM_TRACE} | degradation.decide`, {
        traceId,
        flow: params.flow,
        companyId,
        messageId,
        nextMode: 'diagnostic',
        reason: 'post_approval_silent_mode',
      });
      return {
        nextMode: 'diagnostic',
        reason: 'post_approval_silent_mode',
      };
    }
    const maxFallback = this.config.getDegradationMaxFallbackPerMessage();
    const idempotencyKey = `collab:degrade:${params.flow}:${companyId}:${messageId}:limit:${maxFallback}`;
    const shouldRun = this.resilience.markIfNew(idempotencyKey, 10 * 60_000);
    if (!shouldRun) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | degradation.duplicate_blocked`, {
        traceId,
        flow: params.flow,
        companyId,
        messageId,
        maxFallback,
      });
      return null;
    }

    const isRateLimit = /\b429\b|rate limit|too many requests|quota exceeded|cooldown/.test(normalizedError);
    const isTimeout = /timeout|timed out|etimedout|socket hang up/.test(normalizedError);
    if (isRateLimit || isTimeout) {
      this.logger.log(`${COLLAB_LLM_TRACE} | degradation.decide`, {
        traceId,
        flow: params.flow,
        companyId,
        messageId,
        nextMode: 'light',
        reason: isRateLimit ? 'provider_rate_limit_or_cooldown' : 'upstream_timeout',
      });
      return {
        nextMode: 'light',
        reason: isRateLimit ? 'provider_rate_limit_or_cooldown' : 'upstream_timeout',
      };
    }

    this.logger.log(`${COLLAB_LLM_TRACE} | degradation.decide`, {
      traceId,
      flow: params.flow,
      companyId,
      messageId,
      nextMode: 'diagnostic',
      reason: 'unexpected_exception',
    });
    return {
      nextMode: 'diagnostic',
      reason: 'unexpected_exception',
    };
  }
}
