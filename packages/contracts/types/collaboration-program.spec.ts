import { describe, expect, it } from '@jest/globals';
import {
  canTransitionProgramPhase,
  computeBriefCompleteness,
  mergeDeliverableBrief,
  emptyDeliverableBrief,
  nextPhaseAfterBriefComplete,
  programPhaseToLifecycle,
} from './collaboration-program.js';

describe('collaboration-program', () => {
  it('computes brief completeness', () => {
    const brief = mergeDeliverableBrief(emptyDeliverableBrief('analysis_report'), {
      audience: '营销团队',
      timeframe: '1年',
      persona: '全人群',
      purpose: '寻找增长点',
    });
    expect(brief.completeness).toBe(1);
    expect(brief.missingFields).toHaveLength(0);
  });

  it('allows aligning to ready_to_plan', () => {
    expect(canTransitionProgramPhase('aligning', 'ready_to_plan')).toBe(true);
  });

  it('maps phase to lifecycle', () => {
    expect(programPhaseToLifecycle('dept_executing')).toBe('dept_executing');
    expect(programPhaseToLifecycle('aligning')).toBe('awaiting_confirm');
  });

  it('confirm mode affects next phase', () => {
    expect(nextPhaseAfterBriefComplete('auto')).toBe('ready_to_plan');
    expect(nextPhaseAfterBriefComplete('always')).toBe('pending_confirm');
  });
});
