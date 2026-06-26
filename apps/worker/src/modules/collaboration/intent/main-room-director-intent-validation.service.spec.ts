import { MainRoomDirectorIntentValidationService } from './main-room-director-intent-validation.service.js';
import type { IntentDecision, RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type { AgentDirectorySlice } from '../context/agents-active-directory-cache.service.js';

describe('MainRoomDirectorIntentValidationService', () => {
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
      userFacingReply: { text: '已邀请在场主管，其余不在本群。' },
      ...over,
    };
  }

  function roomAndRoster(directorId: string): { roomContext: RoomContext; roster: AgentDirectorySlice[] } {
    const roomContext: RoomContext = {
      companyId,
      roomId: 'r1',
      roomType: 'main',
      roomName: 'main',
      organizationNodeId: null,
      members: [{ memberType: 'agent', memberId: directorId }],
      memberDirectory: [
        { memberType: 'agent', memberId: directorId, displayName: 'D1', roleLabel: '销售总监' },
      ],
      orgSnapshot: {
        departments: [{ id: 'dept-sales', name: 'Sales', slug: 'sales' }],
        updatedAt: new Date().toISOString(),
      },
    };
    const roster: AgentDirectorySlice[] = [
      { id: directorId, name: 'A', role: 'director', organizationNodeId: 'dept-sales' },
    ];
    return { roomContext, roster };
  }

  it('direct_summon: multiple raw ids with partial whitelist marks partialGroupMatch and matched', async () => {
    const good = 'agent-sales-dir';
    const bad = '99999999-ffff-ffff-ffff-ffffffffffff';
    const layer = baseLayer({
      intentType: 'direct_summon',
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
        targetAgentIds: [good, bad],
        explicitDirectTargets: true,
      },
    });
    const { roomContext, roster } = roomAndRoster(good);
    const cfg = {
      getWorkerActorUserId: () => 'worker',
      isMainRoomIntentDirectorMemoryShadowEnabled: () => false,
      getCollabMainRoomMaxDirectTargets: () => 4,
      isCollabMainRoomAudienceEmployeeNaturalEnabled: () => true,
      getCollabMainRoomAudienceEmployeeNaturalMax: () => 2,
      getCollabMainRoomAudienceEmployeeNaturalMinConfidence: () => 0.78,
    } as any;
    const cache = { getActiveAgents: jest.fn().mockResolvedValue(roster) } as any;
    const memoryShadow = { maybeLog: jest.fn().mockResolvedValue(undefined) } as any;
    const svc = new MainRoomDirectorIntentValidationService(cfg, cache, memoryShadow);
    await svc.applyMainRoomDirectorValidation({
      companyId,
      roomContext,
      layerDecision: layer,
      ceoAgentId: null,
    });
    expect(layer.routingHints.targetAgentIds).toEqual([good]);
    expect(layer.mainRoomAudienceHandoff?.audienceResolvedTargetAgentIds).toEqual([good, bad]);
    expect(layer.directorResolution?.status).toBe('matched');
    expect(layer.directorResolution?.partialGroupMatch).toBe(true);
    expect(layer.directorResolution?.droppedCandidateIds).toEqual([bad]);
    expect(layer.directorResolution?.candidateIdsBeforeFilter).toEqual([good, bad]);
  });

  it('direct_summon: two valid directors stays matched without partialGroupMatch', async () => {
    const a = 'agent-a';
    const b = 'agent-b';
    const layer = baseLayer({
      intentType: 'direct_summon',
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
        targetAgentIds: [a, b],
        explicitDirectTargets: true,
      },
    });
    const roomContext: RoomContext = {
      companyId,
      roomId: 'r1',
      roomType: 'main',
      roomName: 'main',
      organizationNodeId: null,
      members: [
        { memberType: 'agent', memberId: a },
        { memberType: 'agent', memberId: b },
      ],
      memberDirectory: [
        { memberType: 'agent', memberId: a, displayName: 'A', roleLabel: '总监' },
        { memberType: 'agent', memberId: b, displayName: 'B', roleLabel: '总监' },
      ],
      orgSnapshot: {
        departments: [{ id: 'd1', name: 'D', slug: 'd' }],
        updatedAt: new Date().toISOString(),
      },
    };
    const roster: AgentDirectorySlice[] = [
      { id: a, name: 'A', role: 'director', organizationNodeId: 'd1' },
      { id: b, name: 'B', role: 'director', organizationNodeId: 'd1' },
    ];
    const cfg = {
      getWorkerActorUserId: () => 'worker',
      isMainRoomIntentDirectorMemoryShadowEnabled: () => false,
      getCollabMainRoomMaxDirectTargets: () => 4,
      isCollabMainRoomAudienceEmployeeNaturalEnabled: () => true,
      getCollabMainRoomAudienceEmployeeNaturalMax: () => 2,
      getCollabMainRoomAudienceEmployeeNaturalMinConfidence: () => 0.78,
    } as any;
    const cache = { getActiveAgents: jest.fn().mockResolvedValue(roster) } as any;
    const memoryShadow = { maybeLog: jest.fn().mockResolvedValue(undefined) } as any;
    const svc = new MainRoomDirectorIntentValidationService(cfg, cache, memoryShadow);
    await svc.applyMainRoomDirectorValidation({ companyId, roomContext, layerDecision: layer, ceoAgentId: null });
    expect(layer.routingHints.targetAgentIds).toEqual([a, b]);
    expect(layer.directorResolution?.status).toBe('matched');
    expect(layer.directorResolution?.partialGroupMatch).toBeUndefined();
  });

  it('audience_resolution: inferred directors without @mention stay off direct routing', async () => {
    const productDir = 'agent-product-dir';
    const engDir = 'agent-eng-dir';
    const layer = baseLayer({
      intentType: 'audience_resolution',
      confidence: 0.92,
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
        targetAgentIds: [productDir, engDir],
        summonProvenance: 'audience_llm_uuid',
      },
    });
    const roomContext: RoomContext = {
      companyId,
      roomId: 'r1',
      roomType: 'main',
      roomName: 'main',
      organizationNodeId: null,
      members: [
        { memberType: 'agent', memberId: productDir },
        { memberType: 'agent', memberId: engDir },
      ],
      memberDirectory: [
        { memberType: 'agent', memberId: productDir, displayName: '产品总监', roleLabel: '产品总监' },
        { memberType: 'agent', memberId: engDir, displayName: '工程总监', roleLabel: '工程总监' },
      ],
      orgSnapshot: {
        departments: [
          { id: 'dept-product', name: 'Product', slug: 'product' },
          { id: 'dept-eng', name: 'Eng', slug: 'engineering' },
        ],
        updatedAt: new Date().toISOString(),
      },
    };
    const roster: AgentDirectorySlice[] = [
      { id: productDir, name: 'P', role: 'director', organizationNodeId: 'dept-product' },
      { id: engDir, name: 'E', role: 'director', organizationNodeId: 'dept-eng' },
    ];
    const cfg = {
      getWorkerActorUserId: () => 'worker',
      isMainRoomIntentDirectorMemoryShadowEnabled: () => false,
      getCollabMainRoomMaxDirectTargets: () => 4,
      isCollabMainRoomAudienceEmployeeNaturalEnabled: () => true,
      getCollabMainRoomAudienceEmployeeNaturalMax: () => 2,
      getCollabMainRoomAudienceEmployeeNaturalMinConfidence: () => 0.78,
    } as any;
    const cache = { getActiveAgents: jest.fn().mockResolvedValue(roster) } as any;
    const memoryShadow = { maybeLog: jest.fn().mockResolvedValue(undefined) } as any;
    const svc = new MainRoomDirectorIntentValidationService(cfg, cache, memoryShadow);
    await svc.applyMainRoomDirectorValidation({
      companyId,
      roomContext,
      layerDecision: layer,
      ceoAgentId: 'ceo-1',
      mentionedAgentIds: [],
    });
    expect(layer.routingHints.targetAgentIds).toBeUndefined();
    expect(layer.routingHints.explicitDirectTargets).toBe(false);
    expect(layer.mainRoomAudienceHandoff?.audienceResolvedTargetAgentIds).toEqual([productDir, engDir]);
  });

  it('audience_resolution: CEO id in raw targets is matched when ceoAgentId is in room (not director roster)', async () => {
    const ceoId = '6af34396-4aba-4129-8ee0-18ccbb4b1c57';
    const directorId = 'agent-sales-dir';
    const layer = baseLayer({
      intentType: 'audience_resolution',
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
        targetAgentIds: [ceoId],
        explicitDirectTargets: true,
      },
    });
    const roomContext: RoomContext = {
      companyId,
      roomId: 'r1',
      roomType: 'main',
      roomName: 'main',
      organizationNodeId: null,
      members: [
        { memberType: 'agent', memberId: ceoId },
        { memberType: 'agent', memberId: directorId },
      ],
      memberDirectory: [
        { memberType: 'agent', memberId: ceoId, displayName: 'CEO', roleLabel: 'CEO' },
        { memberType: 'agent', memberId: directorId, displayName: 'D1', roleLabel: '销售总监' },
      ],
      orgSnapshot: {
        departments: [{ id: 'dept-sales', name: 'Sales', slug: 'sales' }],
        updatedAt: new Date().toISOString(),
      },
    };
    const roster: AgentDirectorySlice[] = [
      { id: ceoId, name: 'CEO', role: 'ceo', organizationNodeId: '' },
      { id: directorId, name: 'A', role: 'director', organizationNodeId: 'dept-sales' },
    ];
    const cfg = {
      getWorkerActorUserId: () => 'worker',
      isMainRoomIntentDirectorMemoryShadowEnabled: () => false,
      getCollabMainRoomMaxDirectTargets: () => 4,
      isCollabMainRoomAudienceEmployeeNaturalEnabled: () => true,
      getCollabMainRoomAudienceEmployeeNaturalMax: () => 2,
      getCollabMainRoomAudienceEmployeeNaturalMinConfidence: () => 0.78,
    } as any;
    const cache = { getActiveAgents: jest.fn().mockResolvedValue(roster) } as any;
    const memoryShadow = { maybeLog: jest.fn().mockResolvedValue(undefined) } as any;
    const svc = new MainRoomDirectorIntentValidationService(cfg, cache, memoryShadow);
    await svc.applyMainRoomDirectorValidation({
      companyId,
      roomContext,
      layerDecision: layer,
      ceoAgentId: ceoId,
    });
    expect(layer.routingHints.targetAgentIds).toBeUndefined();
    expect(layer.routingHints.explicitDirectTargets).toBe(false);
    expect(layer.mainRoomAudienceHandoff?.audienceResolvedTargetAgentIds).toEqual([ceoId]);
    expect(layer.directorResolution?.status).toBe('matched');
    expect(layer.directorResolution?.chosenAgentIds).toEqual([ceoId]);
  });

  it('audience_resolution: high-confidence in-room employee allowed when employee natural enabled', async () => {
    const employeeId = 'employee-agent-1';
    const layer = baseLayer({
      intentType: 'audience_resolution',
      confidence: 0.88,
      userFacingReply: undefined,
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
        targetAgentIds: [employeeId],
        explicitDirectTargets: true,
      },
    });
    const roomContext: RoomContext = {
      companyId,
      roomId: 'r1',
      roomType: 'main',
      roomName: 'main',
      organizationNodeId: null,
      members: [{ memberType: 'agent', memberId: employeeId }],
      memberDirectory: [
        { memberType: 'agent', memberId: employeeId, displayName: '小周', roleLabel: '工程师' },
      ],
      orgSnapshot: {
        departments: [{ id: 'dept-eng', name: 'Eng', slug: 'eng' }],
        updatedAt: new Date().toISOString(),
      },
    };
    const roster: AgentDirectorySlice[] = [
      { id: employeeId, name: '小周', role: 'employee', organizationNodeId: 'dept-eng' },
    ];
    const cfg = {
      getWorkerActorUserId: () => 'worker',
      isMainRoomIntentDirectorMemoryShadowEnabled: () => false,
      getCollabMainRoomMaxDirectTargets: () => 4,
      isCollabMainRoomAudienceEmployeeNaturalEnabled: () => true,
      getCollabMainRoomAudienceEmployeeNaturalMax: () => 2,
      getCollabMainRoomAudienceEmployeeNaturalMinConfidence: () => 0.78,
    } as any;
    const cache = { getActiveAgents: jest.fn().mockResolvedValue(roster) } as any;
    const memoryShadow = { maybeLog: jest.fn().mockResolvedValue(undefined) } as any;
    const svc = new MainRoomDirectorIntentValidationService(cfg, cache, memoryShadow);
    await svc.applyMainRoomDirectorValidation({ companyId, roomContext, layerDecision: layer, ceoAgentId: null });
    expect(layer.directorResolution?.status).toBe('matched');
    expect(layer.routingHints.targetAgentIds).toEqual([employeeId]);
    expect(layer.mainRoomAudienceHandoff?.audienceResolvedTargetAgentIds).toEqual([employeeId]);
  });

  it('audience_resolution: in-room non-director target dropped when employee natural off or low confidence', async () => {
    const employeeId = 'employee-agent-1';
    const layer = baseLayer({
      intentType: 'audience_resolution',
      confidence: 0.5,
      userFacingReply: { text: 'legacy-summon-placeholder' },
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
        targetAgentIds: [employeeId],
        explicitDirectTargets: true,
      },
    });
    const roomContext: RoomContext = {
      companyId,
      roomId: 'r1',
      roomType: 'main',
      roomName: 'main',
      organizationNodeId: null,
      members: [{ memberType: 'agent', memberId: employeeId }],
      memberDirectory: [
        { memberType: 'agent', memberId: employeeId, displayName: '小周', roleLabel: '工程师' },
      ],
      orgSnapshot: {
        departments: [{ id: 'dept-eng', name: 'Eng', slug: 'eng' }],
        updatedAt: new Date().toISOString(),
      },
    };
    const roster: AgentDirectorySlice[] = [
      { id: employeeId, name: '小周', role: 'employee', organizationNodeId: 'dept-eng' },
    ];
    const cfg = {
      getWorkerActorUserId: () => 'worker',
      isMainRoomIntentDirectorMemoryShadowEnabled: () => false,
      getCollabMainRoomMaxDirectTargets: () => 4,
      isCollabMainRoomAudienceEmployeeNaturalEnabled: () => true,
      getCollabMainRoomAudienceEmployeeNaturalMax: () => 2,
      getCollabMainRoomAudienceEmployeeNaturalMinConfidence: () => 0.78,
    } as any;
    const cache = { getActiveAgents: jest.fn().mockResolvedValue(roster) } as any;
    const memoryShadow = { maybeLog: jest.fn().mockResolvedValue(undefined) } as any;
    const svc = new MainRoomDirectorIntentValidationService(cfg, cache, memoryShadow);
    await svc.applyMainRoomDirectorValidation({ companyId, roomContext, layerDecision: layer, ceoAgentId: null });
    expect(layer.directorResolution?.status).toBe('none');
    expect(layer.mainRoomAudienceHandoff?.audienceResolvedTargetAgentIds).toEqual([employeeId]);
    expect(layer.userFacingReply).toBeUndefined();
    expect(layer.routingHints.targetAgentIds).toBeUndefined();
  });

  it('clears stale mainRoomAudienceHandoff when routingHints.targetAgentIds is empty', async () => {
    const directorId = 'agent-sales-dir';
    const layer: IntentDecision = {
      traceId: 't1',
      roomType: 'main',
      intentType: 'audience_resolution',
      confidence: 0.92,
      explanation: 'x',
      routingHints: {
        riskLevel: 'medium',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
      },
      targetDepartmentSlugs: [],
      targetLayer: 'orchestration',
      mainRoomAudienceHandoff: { audienceResolvedTargetAgentIds: ['stale-id'] },
    };
    const { roomContext, roster } = roomAndRoster(directorId);
    const cfg = {
      getWorkerActorUserId: () => 'worker',
      isMainRoomIntentDirectorMemoryShadowEnabled: () => false,
      getCollabMainRoomMaxDirectTargets: () => 4,
      isCollabMainRoomAudienceEmployeeNaturalEnabled: () => true,
      getCollabMainRoomAudienceEmployeeNaturalMax: () => 2,
      getCollabMainRoomAudienceEmployeeNaturalMinConfidence: () => 0.78,
    } as any;
    const cache = { getActiveAgents: jest.fn().mockResolvedValue(roster) } as any;
    const memoryShadow = { maybeLog: jest.fn().mockResolvedValue(undefined) } as any;
    const svc = new MainRoomDirectorIntentValidationService(cfg, cache, memoryShadow);
    await svc.applyMainRoomDirectorValidation({ companyId, roomContext, layerDecision: layer, ceoAgentId: null });
    expect(layer.mainRoomAudienceHandoff).toBeUndefined();
  });

  it('audience_resolution: none with no raw targets — do not inject director summon fallback', async () => {
    const layer: IntentDecision = {
      traceId: 't1',
      roomType: 'main',
      intentType: 'audience_resolution',
      confidence: 0.92,
      explanation: 'ceo_line',
      routingHints: {
        riskLevel: 'medium',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
      },
      targetDepartmentSlugs: [],
      targetLayer: 'orchestration',
    };
    const directorId = 'agent-sales-dir';
    const { roomContext, roster } = roomAndRoster(directorId);
    const cfg = {
      getWorkerActorUserId: () => 'worker',
      isMainRoomIntentDirectorMemoryShadowEnabled: () => false,
      getCollabMainRoomMaxDirectTargets: () => 4,
      isCollabMainRoomAudienceEmployeeNaturalEnabled: () => true,
      getCollabMainRoomAudienceEmployeeNaturalMax: () => 2,
      getCollabMainRoomAudienceEmployeeNaturalMinConfidence: () => 0.78,
    } as any;
    const cache = { getActiveAgents: jest.fn().mockResolvedValue(roster) } as any;
    const memoryShadow = { maybeLog: jest.fn().mockResolvedValue(undefined) } as any;
    const svc = new MainRoomDirectorIntentValidationService(cfg, cache, memoryShadow);
    await svc.applyMainRoomDirectorValidation({ companyId, roomContext, layerDecision: layer, ceoAgentId: null });
    expect(layer.directorResolution?.status).toBe('none');
    expect(layer.mainRoomAudienceHandoff).toBeUndefined();
    expect(layer.userFacingReply).toBeUndefined();
  });
});
