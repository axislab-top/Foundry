/// <reference types="jest" />
import { createHash } from 'node:crypto';

/** 与 Worker `rollout-service.ts` 及 API `phase3-rollout-cohort.util.ts` 保持同步 */
const PHASE3_BUNDLE_ROLLOUT_SALT = 'phase3-bundle';

function stablePhase3BundleRolloutHit(companyId: string, pct: number): boolean {
  const id = String(companyId ?? '').trim();
  if (!id) return false;
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  const h = createHash('sha256').update(`${PHASE3_BUNDLE_ROLLOUT_SALT}:${id}`).digest();
  return h[0]! % 100 < pct;
}

function isPhase3RolloutCohortMember(
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
  return stablePhase3BundleRolloutHit(id, pct);
}

describe('Phase3 full rollout (W16)', () => {
  it('stablePhase3BundleRolloutHit matches sha256 contract', () => {
    expect(stablePhase3BundleRolloutHit('acme-co', 0)).toBe(false);
    expect(stablePhase3BundleRolloutHit('acme-co', 100)).toBe(true);
    const pct = 50;
    const id = 'fixed-company-id';
    const h = createHash('sha256').update(`${PHASE3_BUNDLE_ROLLOUT_SALT}:${id}`).digest();
    const wantHit = h[0]! % 100 < pct;
    expect(stablePhase3BundleRolloutHit(id, pct)).toBe(wantHit);
  });

  it('isPhase3RolloutCohortMember respects master switch and whitelist', () => {
    expect(
      isPhase3RolloutCohortMember('c1', {
        masterEnabled: false,
        percent: 100,
        whitelistCompanyIds: ['c1'],
      }),
    ).toBe(false);
    expect(
      isPhase3RolloutCohortMember('c1', {
        masterEnabled: true,
        percent: 0,
        whitelistCompanyIds: ['c1'],
      }),
    ).toBe(true);
  });
});
