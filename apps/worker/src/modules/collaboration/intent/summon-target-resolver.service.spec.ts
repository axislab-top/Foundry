import { SummonTargetResolverService } from './summon-target-resolver.service.js';
import type { IntentDecision, RoomContext } from '../contracts/collaboration-2026.contracts.js';

describe('SummonTargetResolverService', () => {
  const companyId = 'c1';

  function baseLayer(over: Partial<IntentDecision> = {}): IntentDecision {
    return {
      traceId: 't1',
      roomType: 'main',
      intentType: 'direct_summon',
      confidence: 0.9,
      explanation: 'x',
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
        ...over.routingHints,
      },
      targetDepartmentSlugs: over.targetDepartmentSlugs ?? [],
      targetLayer: 'orchestration',
      ...over,
    };
  }

  it('keeps explicit valid UUID targets', async () => {
    const id = '7a0b0c0d-0e0f-4a1b-8c2d-1e2f3a4b5c6d';
    const layer = baseLayer({
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
        targetAgentIds: [id],
        explicitDirectTargets: true,
      },
    });
    const cfg = { getWorkerActorUserId: () => 'worker', getCollabMainRoomMaxDirectTargets: () => 4 } as any;
    const cache = { getActiveAgents: jest.fn() } as any;
    const svc = new SummonTargetResolverService(cfg, cache);
    const roomContext = { memberDirectory: [], orgSnapshot: { departments: [], updatedAt: '' } } as RoomContext;
    const out = await svc.enrichLayerDecisionForSummonTargets({
      companyId,
      userText: 'hi',
      roomContext,
      layerDecision: layer,
      ceoAgentId: null,
    });
    expect(out.resolutionTrace).toContain('explicit_valid_uuid');
    expect(layer.routingHints.targetAgentIds).toEqual([id]);
    expect(layer.routingHints.summonProvenance).toBe('audience_llm_uuid');
    expect(layer.routingHints.explicitDirectTargets).toBe(true);
    expect(cache.getActiveAgents).not.toHaveBeenCalled();
  });

  it('normalizes all-UUID targets when explicitDirectTargets omitted (no redundant NL/RPC)', async () => {
    const id = '7a0b0c0d-0e0f-4a1b-8c2d-1e2f3a4b5c6d';
    const layer = baseLayer({
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
        targetAgentIds: [id],
      },
    });
    const cfg = { getWorkerActorUserId: () => 'worker', getCollabMainRoomMaxDirectTargets: () => 4 } as any;
    const cache = { getActiveAgents: jest.fn() } as any;
    const svc = new SummonTargetResolverService(cfg, cache);
    const roomContext = { memberDirectory: [], orgSnapshot: { departments: [], updatedAt: '' } } as RoomContext;
    const out = await svc.enrichLayerDecisionForSummonTargets({
      companyId,
      userText: 'hi',
      roomContext,
      layerDecision: layer,
      ceoAgentId: null,
    });
    expect(out.resolutionTrace).toContain('normalized_all_uuid_targets');
    expect(layer.routingHints.targetAgentIds).toEqual([id]);
    expect(layer.routingHints.summonProvenance).toBe('audience_llm_uuid');
    expect(layer.routingHints.explicitDirectTargets).toBeUndefined();
    expect(cache.getActiveAgents).not.toHaveBeenCalled();
  });

  it('clears placeholder ids and resolves by department slug + director', async () => {
    const layer = baseLayer({
      targetDepartmentSlugs: ['sales'],
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
        targetAgentIds: ['agent-sales-director-001'],
        explicitDirectTargets: true,
      },
    });
    const cfg = { getWorkerActorUserId: () => 'worker', getCollabMainRoomMaxDirectTargets: () => 4 } as any;
    const cache = {
      getActiveAgents: jest.fn(async () => [
        {
          id: 'dir-sales-uuid',
          name: 'Sales Director',
          role: 'director',
          organizationNodeId: 'node-sales',
        },
      ]),
    } as any;
    const svc = new SummonTargetResolverService(cfg, cache);
    const roomContext = {
      memberDirectory: [
        {
          memberType: 'agent' as const,
          memberId: 'dir-sales-uuid',
          displayName: 'SD',
          roleLabel: 'director',
        },
      ],
      orgSnapshot: {
        departments: [{ id: 'node-sales', name: 'Sales', slug: 'sales' }],
        updatedAt: new Date().toISOString(),
      },
    } as RoomContext;

    await svc.enrichLayerDecisionForSummonTargets({
      companyId,
      userText: '请安排',
      roomContext,
      layerDecision: layer,
      ceoAgentId: null,
    });

    expect(layer.routingHints.targetAgentIds).toEqual(['dir-sales-uuid']);
    expect(layer.routingHints.explicitDirectTargets).toBe(true);
    expect(cache.getActiveAgents).toHaveBeenCalled();
  });
});
