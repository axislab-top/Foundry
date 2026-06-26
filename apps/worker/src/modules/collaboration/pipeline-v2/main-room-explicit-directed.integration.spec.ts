import type { IntentDecision } from '../contracts/collaboration-2026.contracts.js';
import { filterMainRoomAudienceRoutableAgentIds } from '../intent/main-room-audience-cap.util.js';
import { resolveMainRoomRoute } from './resolve-main-room-route.util.js';

/**
 * 阶段 10：explicit_directed 路由与专员 cap 门控串联验收（不启动服务）。
 */
describe('explicit_directed + employee natural cap (integration)', () => {
  const roomAgentIds = new Set(['emp-1', 'emp-2', 'emp-3']);
  const roster = [
    { id: 'emp-1', role: 'employee', organizationNodeId: 'd1' },
    { id: 'emp-2', role: 'employee', organizationNodeId: 'd1' },
    { id: 'emp-3', role: 'employee', organizationNodeId: 'd1' },
  ];

  function layerWithEmployees(ids: string[]): IntentDecision {
    return {
      traceId: 't1',
      roomType: 'main',
      intentType: 'audience_resolution',
      confidence: 0.85,
      explanation: 'specialists in room',
      targetDepartmentSlugs: [],
      targetLayer: null,
      routingHints: {
        riskLevel: 'low',
        shouldExecute: false,
        requiresParallelism: false,
        responseMode: 'direct_reply',
        targetAgentIds: ids,
        explicitDirectTargets: true,
      },
    };
  }

  function unifiedIntent() {
    return {
      schemaVersion: '2026.1',
      traceId: 't1',
      roomId: 'r1',
      intentType: 'audience_resolution',
      confidence: 0.85,
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        suggestedDepartmentSlugs: [],
        targetAgentIds: ['emp-1', 'emp-2', 'emp-3'],
      },
      explanation: 'x',
    } as import('@contracts/types').CollaborationIntentDecisionV20261;
  }

  it('routes explicit_directed then caps employee targets to natural max', () => {
    const layer = layerWithEmployees(['emp-1', 'emp-2', 'emp-3']);
    const route = resolveMainRoomRoute({
      userText: '@专员 请协助整理材料',
      layerDecision: layer,
      intentDecision2026_1: unifiedIntent(),
      maxDirect: 8,
    });
    expect(route.kind).toBe('explicit_directed');

    const filtered = filterMainRoomAudienceRoutableAgentIds({
      rawIds: layer.routingHints.targetAgentIds ?? [],
      directorWhitelist: new Set(),
      mentionAllow: new Set(),
      ceoInRoom: false,
      ceoId: '',
      roster,
      roomAgentIds,
      maxDirect: 8,
      employeeNaturalEnabled: true,
      maxEmployeeNatural: 2,
      minConfidenceForEmployee: 0.78,
      audienceConfidence: layer.confidence,
    });

    expect(filtered.filtered).toEqual(['emp-1', 'emp-2']);
    expect(filtered.droppedEmployeeIds).toEqual(['emp-3']);
    expect(filtered.allowedEmployeeIds).toEqual(['emp-1', 'emp-2']);
  });

  it('explicit_directed not chosen when CEO summoned despite employee targets', () => {
    const layer = layerWithEmployees(['emp-1']);
    const route = resolveMainRoomRoute({
      dispatchPlanV2Enabled: true,
      userText: '@CEO 请安排',
      layerDecision: layer,
      intentDecision2026_1: unifiedIntent(),
      ceoAgentId: 'ceo-1',
      mentionedAgentIds: ['ceo-1'],
      maxDirect: 8,
    });
    expect(route.kind).toBe('ceo_replay_delegate');
  });
});
