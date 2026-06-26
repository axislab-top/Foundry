import {
  buildStrategyCeoPackMemoryQuerySuffix,
  buildStrategyCortexMemorySearchQuerySuffix,
  resolveStrategyPlanningProfile,
  sanitizeStrategyUserVisibleText,
} from './strategy-planning-profile.util.js';

describe('strategy memory retrieval suffix (unified collaborative delivery)', () => {
  it('CEO pack suffix is stable and avoids legacy strategy/growth hard-bias tokens', () => {
    const s = buildStrategyCeoPackMemoryQuerySuffix('company');
    expect(s).toContain('collaboration');
    expect(s).toContain('handoffs');
    expect(s).not.toContain('company objective strategy org governance');
  });

  it('deliverable profile uses documentation-oriented suffix', () => {
    const s = buildStrategyCeoPackMemoryQuerySuffix('deliverable');
    expect(s).toContain('documentation');
    expect(s).toContain('deliverable');
  });

  it('resolveStrategyPlanningProfile honors task_publish', () => {
    expect(
      resolveStrategyPlanningProfile({ messageCategory: 'task_publish', mode: 'deliverable_bias' }),
    ).toBe('deliverable');
    expect(resolveStrategyPlanningProfile({ messageCategory: 'task_publish', mode: 'unified' })).toBe(
      'company',
    );
  });

  it('Cortex suffix is stable and avoids legacy product/customer/strategy tail', () => {
    const s = buildStrategyCortexMemorySearchQuerySuffix('company');
    expect(s).toContain('deliverables');
    expect(s).toContain('acceptance');
    expect(s).not.toMatch(/strategy objective.*product customer/i);
  });

  it('sanitizeStrategyUserVisibleText strips knowledge pack echo and fences', () => {
    const dirty = '目标说明\n### B. company_cortex_core\njunk';
    expect(sanitizeStrategyUserVisibleText(dirty)).toBe('目标说明');
    expect(sanitizeStrategyUserVisibleText('```json\n{"x":1}\n```', { maxLen: 40 })).toContain('x');
  });
});
