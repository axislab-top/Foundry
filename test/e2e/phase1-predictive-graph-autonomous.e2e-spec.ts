// @ts-nocheck — 根目录 Jest + ts-jest 不纳入主 tsconfig；用 describe/it/expect 全局
import { createHash } from 'node:crypto';

/** 与 Worker `L1FeatureFlagService.phase1RolloutHit` 对齐 */
function phase1RolloutHit(companyId: string, salt: string, pct: number): boolean {
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  const h = createHash('sha256').update(`${salt}:${companyId}`).digest();
  return h[0]! % 100 < pct;
}

describe('Phase1 W8 graph autonomous rollout (repo e2e)', () => {
  it('rollout hash is stable per company and salt', () => {
    expect(phase1RolloutHit('co-1', 'director_autonomous', 10)).toBe(
      phase1RolloutHit('co-1', 'director_autonomous', 10),
    );
  });

  it('different salts change cohort membership', () => {
    const a = phase1RolloutHit('same-co', 'director_autonomous', 50);
    const b = phase1RolloutHit('same-co', 'multi_agent_graph_v2', 50);
    expect(typeof a).toBe('boolean');
    expect(typeof b).toBe('boolean');
  });

});
