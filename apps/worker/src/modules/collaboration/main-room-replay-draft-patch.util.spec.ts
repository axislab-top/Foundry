import { buildStrategyPatchPayloadFromReplaySummary } from './main-room-replay-draft-patch.util.js';

describe('buildStrategyPatchPayloadFromReplaySummary', () => {
  it('returns null for short or empty summary', () => {
    expect(buildStrategyPatchPayloadFromReplaySummary('')).toBeNull();
    expect(buildStrategyPatchPayloadFromReplaySummary('   short  ')).toBeNull();
  });

  it('uses single synthetic phase when no bullet lines', () => {
    const body = '这是足够长的 Replay 摘要用于对齐战略目标草稿。'.repeat(2);
    const out = buildStrategyPatchPayloadFromReplaySummary(body);
    expect(out).not.toBeNull();
    expect(out!.strategyGoal).toContain('Replay');
    expect(out!.strategicPhases).toHaveLength(1);
    expect(out!.strategicPhases[0].title).toBe('Replay 对齐要点');
    expect(out!.strategicPhases[0].outcome.length).toBeGreaterThan(10);
  });

  it('extracts bullet lines into strategic phases and keeps prose as strategy goal', () => {
    const raw = `本季度要打赢华东续费战役。

- KR1：续费率提升至 92%
- KR2：流失预警覆盖 100% 大客户
2) 建立周会复盘机制`;

    const out = buildStrategyPatchPayloadFromReplaySummary(raw);
    expect(out).not.toBeNull();
    expect(out!.strategyGoal).toContain('本季度要打赢');
    expect(out!.strategyGoal).not.toMatch(/^[-*•]/);
    expect(out!.strategicPhases.length).toBeGreaterThanOrEqual(3);
    expect(out!.strategicPhases[0].outcome).toContain('92%');
  });

  it('parses title: outcome pairs in bullet lines', () => {
    const raw = '目标概述在这里写够八个字以上。\n\n- 交付：完成 API 网关改造';
    const out = buildStrategyPatchPayloadFromReplaySummary(raw);
    expect(out!.strategicPhases[0].title).toContain('交付');
    expect(out!.strategicPhases[0].outcome).toContain('API');
  });
});
