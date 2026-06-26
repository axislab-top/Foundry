import type { DistributionPlan, PlanningResult } from '@contracts/types';

describe('CEO v2 contract identity fields', () => {
  it('JSON roundtrip preserves planAnchorMessageId, turnMessageId, routingRootMessageId, runId on DistributionPlan', () => {
    const plan: DistributionPlan = {
      schemaVersion: '1.0',
      distributionId: 'dist-1',
      planId: 'plan-1',
      tasks: [
        {
          taskId: 't1',
          department: 'eng',
          ownerAgent: 'a1',
          priority: 'P0',
          dependencies: [],
          slaSeconds: 60,
          deliverable: 'x',
        },
      ],
      parallelism: { maxConcurrentDepartments: 2 },
      fallbackPolicy: { onTimeout: 'partial_merge', onDepartmentFailure: 'retry_then_degrade' },
      traceId: 'anchor-1',
      planAnchorMessageId: 'anchor-1',
      turnMessageId: 'turn-1',
      routingRootMessageId: 'root-1',
      runId: 'run-1',
    };
    const json = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
    expect(json.planAnchorMessageId).toBe('anchor-1');
    expect(json.turnMessageId).toBe('turn-1');
    expect(json.routingRootMessageId).toBe('root-1');
    expect(json.runId).toBe('run-1');
    expect(json.traceId).toBe('anchor-1');
  });

  it('JSON roundtrip preserves correlation fields on PlanningResult', () => {
    const pr: PlanningResult = {
      schemaVersion: '1.0',
      planId: 'plan-1',
      goal: 'g',
      strategicPhases: [{ phaseId: 'p1', title: 'kr', outcome: '可验收成果在90天内达到100%', deadline: '2026-12-31T00:00:00.000Z' }],
      resourceNeeds: { estimatedTokens: 1, estimatedCostUsd: 0 },
      riskAssessment: { level: 'low', factors: [] },
      timeline: { startAt: '2026-01-01', targetEndAt: '2026-12-31' },
      approvalFlag: false,
      traceId: 'anchor-1',
      planAnchorMessageId: 'anchor-1',
      turnMessageId: 'turn-1',
      routingRootMessageId: 'root-1',
      runId: 'run-1',
    };
    const json = JSON.parse(JSON.stringify(pr)) as Record<string, unknown>;
    expect(json.planAnchorMessageId).toBe('anchor-1');
    expect(json.turnMessageId).toBe('turn-1');
    expect(json.routingRootMessageId).toBe('root-1');
    expect(json.runId).toBe('run-1');
  });
});
