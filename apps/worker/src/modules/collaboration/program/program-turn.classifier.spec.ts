import type { CollaborationProgramRecord } from '@contracts/types';
import { classifyProgramTurn, shouldBlockExplicitDirectedForProgramTurn } from './program-turn.classifier.js';

const baseProgram = (phase: CollaborationProgramRecord['phase']): CollaborationProgramRecord =>
  ({
    id: 'p1',
    companyId: 'c1',
    roomId: 'r1',
    threadId: 'main',
    sourceMessageId: 'm1',
    phase,
    brief: {
      deliverableType: 'analysis_report',
      completeness: 0.5,
      missingFields: ['audience'],
    },
    lifecycle: 'awaiting_confirm',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }) as CollaborationProgramRecord;

describe('program-turn.classifier', () => {
  it('classifies complaint when program open', () => {
    const turn = classifyProgramTurn({
      userText: '所以呢？为什么没有给我报告',
      activeProgram: baseProgram('aligning'),
    });
    expect(turn).toBe('complaint_gap');
    expect(shouldBlockExplicitDirectedForProgramTurn(turn)).toBe(true);
  });

  it('classifies deliverable intake when no program', () => {
    const turn = classifyProgramTurn({
      userText: '帮我写一份市场分析报告',
      activeProgram: null,
    });
    expect(turn).toBe('deliverable_intake');
  });
});
