import type { IntentDecision } from '@contracts/types';

export type CeoV2HeavyTemporalDecision = {
  /** 是否尝试走 Temporal root workflow（仍受服务端 Temporal 连通性影响） */
  preferTemporal: boolean;
  /** 决策原因，用于日志 */
  reason: string;
};

function isHeavyTemporalIntent(intentDecision: IntentDecision): boolean {
  return (
    intentDecision.intentType === 'orchestration' ||
    (intentDecision.shouldExecute === true && intentDecision.routingHints?.requiresParallelism === true)
  );
}

/**
 * 合并「重意图启发式」与租户 rollout / 功能开关，得到是否优先 Temporal 的单一结论。
 */
export function decideCeoV2HeavyTemporalPreference(params: {
  intentDecision: IntentDecision;
  temporalWorkerEnabled: boolean;
  companyInTemporalAllowlist: boolean;
  rolloutPercent: number;
  rolloutBucket: number;
  heavyDefaultTemporal: boolean;
}): CeoV2HeavyTemporalDecision {
  if (!params.temporalWorkerEnabled) {
    return { preferTemporal: false, reason: 'temporal_worker_disabled' };
  }
  if (!isHeavyTemporalIntent(params.intentDecision)) {
    return { preferTemporal: false, reason: 'intent_not_heavy_parallel' };
  }
  if (params.companyInTemporalAllowlist) {
    return { preferTemporal: true, reason: 'company_allowlist' };
  }
  const pct = Math.max(0, Math.min(100, Math.floor(params.rolloutPercent)));
  if (pct >= 100) {
    return { preferTemporal: true, reason: 'rollout_full' };
  }
  if (pct > 0 && params.rolloutBucket < pct) {
    return { preferTemporal: true, reason: 'rollout_percent' };
  }
  if (params.heavyDefaultTemporal) {
    return { preferTemporal: true, reason: 'heavy_default_temporal' };
  }
  return { preferTemporal: false, reason: 'rollout_off' };
}
