import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { metrics } from '@opentelemetry/api';
import { ConfigService } from '../../../common/config/config.service.js';
import type { L1FeatureFlagService } from '../l1/l1-feature-flag.service.js';
import { PHASE3_L1_ROLLOUT_DELEGATE } from './phase3-rollout.tokens.js';

type Phase3L1Delegate = Pick<
  L1FeatureFlagService,
  | 'isMultiAgentGraphV2Effective'
  | 'isDirectorAutonomousEffective'
  | 'isEmployeeAutonomousEffective'
  | 'isAutonomousEventBusV2Effective'
  | 'isCrossDepartmentCoordinationEffective'
  | 'isCostAwareRoutingEffective'
  | 'getPhase3HeartbeatRolloutPercentOverride'
  | 'isPhase2RolloutGranted'
>;

/** Salt for Phase3 bundle cohort hashing（须与 API `phase3-rollout-cohort.util` 一致） */
export const PHASE3_BUNDLE_ROLLOUT_SALT = 'phase3-bundle';

export function stablePhase3BundleRolloutHit(companyId: string, pct: number): boolean {
  const id = String(companyId ?? '').trim();
  if (!id) return false;
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  const h = createHash('sha256').update(`${PHASE3_BUNDLE_ROLLOUT_SALT}:${id}`).digest();
  return h[0]! % 100 < pct;
}

export type Phase3BundleSnapshot = {
  phase3RolloutMasterEnabled: boolean;
  phase3RolloutCohort: boolean;
  phase3RolloutPercent: number;
  phase3RolloutHeartbeatPercentOverride: number | null;
  ffQueryMatched: boolean;
  multiAgentGraphV2: boolean;
  directorAutonomous: boolean;
  employeeAutonomous: boolean;
  autonomousEventBusV2: boolean;
  crossDepartmentCoordination: boolean;
  costAwareRouting: boolean;
  memoryGraphV2ProcessEnabled: boolean;
  phase2RolloutGranted: boolean;
};

/**
 * W16：统一管理 Phase3 渐进开启 — 总闸 + 白名单 + 百分比 + `?ff=phase3_bundle` + 公司 heartbeat（runtime_preferences.l1.phase3RolloutPercent）。
 * 各子能力仍以 {@link L1FeatureFlagService} 的 `is*Effective` 为最终门控；本服务提供一页式观测与 cohort 判定。
 */
@Injectable()
export class Phase3RolloutService {
  private readonly meter = metrics.getMeter('foundry.phase3');
  private readonly cohortEval = this.meter.createCounter('foundry.phase3.rollout.cohort_eval_total', {
    description: 'Phase3 rollout cohort checks',
  });

  constructor(
    private readonly config: ConfigService,
    @Inject(PHASE3_L1_ROLLOUT_DELEGATE) private readonly l1: Phase3L1Delegate,
  ) {}

  async isPhase3RolloutCohortMember(companyId: string, clientFeatureFlags?: string[]): Promise<boolean> {
    const id = String(companyId ?? '').trim();
    if (!id) {
      this.cohortEval.add(1, { granted: 'false', reason: 'empty_company' });
      return false;
    }
    if (!this.config.isPhase3RolloutEnabled()) {
      this.cohortEval.add(1, { granted: 'false', reason: 'master_off' });
      return false;
    }
    const ff =
      clientFeatureFlags?.includes('phase3_bundle') || clientFeatureFlags?.includes('phase3-bundle');
    if (ff) {
      this.cohortEval.add(1, { granted: 'true', reason: 'ff_query' });
      return true;
    }
    if (this.config.getPhase3RolloutWhitelistCompanyIds().includes(id)) {
      this.cohortEval.add(1, { granted: 'true', reason: 'whitelist' });
      return true;
    }
    const heartbeatOverride = await this.l1.getPhase3HeartbeatRolloutPercentOverride(id);
    const pct = heartbeatOverride ?? this.config.getPhase3RolloutPercent();
    const hit = stablePhase3BundleRolloutHit(id, pct);
    this.cohortEval.add(1, { granted: hit ? 'true' : 'false', reason: 'percent' });
    return hit;
  }

  async getBundleSnapshot(companyId: string, clientFeatureFlags?: string[]): Promise<Phase3BundleSnapshot> {
    const master = this.config.isPhase3RolloutEnabled();
    const cohort = master ? await this.isPhase3RolloutCohortMember(companyId, clientFeatureFlags) : false;
    const heartbeatOverride = await this.l1.getPhase3HeartbeatRolloutPercentOverride(companyId);
    const ffQueryMatched =
      Boolean(clientFeatureFlags?.includes('phase3_bundle')) ||
      Boolean(clientFeatureFlags?.includes('phase3-bundle'));

    const [
      multiAgentGraphV2,
      directorAutonomous,
      employeeAutonomous,
      autonomousEventBusV2,
      crossDepartmentCoordination,
      costAwareRouting,
      phase2RolloutGranted,
    ] = await Promise.all([
      this.l1.isMultiAgentGraphV2Effective(companyId, clientFeatureFlags),
      this.l1.isDirectorAutonomousEffective(companyId, clientFeatureFlags),
      this.l1.isEmployeeAutonomousEffective(companyId, clientFeatureFlags),
      this.l1.isAutonomousEventBusV2Effective(companyId, clientFeatureFlags),
      this.l1.isCrossDepartmentCoordinationEffective(companyId, clientFeatureFlags),
      this.l1.isCostAwareRoutingEffective(companyId, clientFeatureFlags),
      Promise.resolve(this.l1.isPhase2RolloutGranted(companyId)),
    ]);

    return {
      phase3RolloutMasterEnabled: master,
      phase3RolloutCohort: cohort,
      phase3RolloutPercent: this.config.getPhase3RolloutPercent(),
      phase3RolloutHeartbeatPercentOverride: heartbeatOverride,
      ffQueryMatched,
      multiAgentGraphV2,
      directorAutonomous,
      employeeAutonomous,
      autonomousEventBusV2,
      crossDepartmentCoordination,
      costAwareRouting,
      memoryGraphV2ProcessEnabled: this.config.isMemoryGraphV2Enabled(),
      phase2RolloutGranted,
    };
  }
}
