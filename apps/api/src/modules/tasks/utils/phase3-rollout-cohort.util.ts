import { createHash } from 'node:crypto';

/** 与 Worker `rollout/rollout-service.ts` 中 {@link PHASE3_BUNDLE_ROLLOUT_SALT} 一致 */
export const PHASE3_BUNDLE_ROLLOUT_SALT = 'phase3-bundle';

export function isPhase3RolloutCohortMember(
  companyId: string,
  opts: {
    masterEnabled: boolean;
    percent: number;
    whitelistCompanyIds: string[];
    heartbeatPercentOverride?: number | null;
  },
): boolean {
  const id = String(companyId ?? '').trim();
  if (!id || !opts.masterEnabled) return false;
  if (opts.whitelistCompanyIds.includes(id)) return true;
  const pct =
    typeof opts.heartbeatPercentOverride === 'number' && Number.isFinite(opts.heartbeatPercentOverride)
      ? Math.max(0, Math.min(100, Math.floor(opts.heartbeatPercentOverride)))
      : opts.percent;
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  const h = createHash('sha256').update(`${PHASE3_BUNDLE_ROLLOUT_SALT}:${id}`).digest();
  return h[0]! % 100 < pct;
}
