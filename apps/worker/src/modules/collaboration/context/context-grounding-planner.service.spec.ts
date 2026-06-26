import { Test } from '@nestjs/testing';
import { AIMessage } from '@langchain/core/messages';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from '../collaboration-llm-bridge.service.js';
import { CeoLayerConfigResolverService } from '../ceo/resolver/ceo-layer-config-resolver.service.js';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import { ContextGroundingPlannerService } from './context-grounding-planner.service.js';

describe('ContextGroundingPlannerService', () => {
  let service: ContextGroundingPlannerService;
  let llmBridge: { createChatModel: jest.Mock };
  let ceoResolver: { resolveLayerSetting: jest.Mock };
  let config: {
    isCeoContextGroundingPlannerEnabled: jest.Mock;
    getCeoDecisionLlmTimeoutMs: jest.Mock;
  };

  function baseRoom(over?: Partial<RoomContext>): RoomContext {
    return {
      companyId: 'co1',
      roomId: 'room1',
      roomType: 'main',
      roomName: 'Main',
      organizationNodeId: null,
      members: [],
      memberDirectory: [],
      orgSnapshot: { departments: [], updatedAt: new Date().toISOString() },
      ...over,
    };
  }

  beforeEach(async () => {
    llmBridge = { createChatModel: jest.fn() };
    ceoResolver = { resolveLayerSetting: jest.fn().mockResolvedValue({ modelName: 'gpt-4o-mini' }) };
    config = {
      isCeoContextGroundingPlannerEnabled: jest.fn(() => true),
      getCeoDecisionLlmTimeoutMs: jest.fn(() => 120_000),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContextGroundingPlannerService,
        { provide: ConfigService, useValue: config },
        { provide: CollaborationLlmBridgeService, useValue: llmBridge },
        { provide: CeoLayerConfigResolverService, useValue: ceoResolver },
      ],
    }).compile();
    service = moduleRef.get(ContextGroundingPlannerService);
  });

  function mockLlmReturnsJson(obj: unknown) {
    const text = JSON.stringify(obj);
    llmBridge.createChatModel.mockResolvedValue({
      invoke: jest.fn().mockResolvedValue(new AIMessage(text)),
    });
  }

  it('returns minimal fallback when planner is disabled', async () => {
    config.isCeoContextGroundingPlannerEnabled.mockReturnValue(false);
    const plan = await service.planGrounding({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '在吗',
      messageId: 'm1',
    });
    expect(llmBridge.createChatModel).not.toHaveBeenCalled();
    expect(plan.prefetchBlocks).toEqual(['speaker', 'transcript']);
    expect(plan.source).toBe('disabled');
    expect(plan.factsQueryTypes).toEqual([]);
  });

  it('parses LLM plan and always includes speaker', async () => {
    mockLlmReturnsJson({
      prefetchBlocks: ['transcript', 'room_roster'],
      factsQueryTypes: ['room_members'],
      toolPolicy: 'tools_allowed',
      confidence: 0.88,
      explanation: '用户问成员',
    });
    const plan = await service.planGrounding({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '群里有哪些人',
      messageId: 'm2',
    });
    expect(plan.source).toBe('llm');
    expect(plan.prefetchBlocks[0]).toBe('speaker');
    expect(plan.prefetchBlocks).toContain('room_roster');
    expect(plan.factsQueryTypes).toEqual(['room_members']);
    expect(plan.confidence).toBe(0.88);
  });

  it('drops unknown block ids and facts query types', async () => {
    mockLlmReturnsJson({
      prefetchBlocks: ['speaker', 'bogus_block', 'org_snapshot'],
      factsQueryTypes: ['org_structure', 'evil_type'],
      confidence: 0.7,
    });
    const plan = await service.planGrounding({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '公司有哪些部门',
      messageId: 'm3',
    });
    expect(plan.prefetchBlocks).toEqual(['speaker', 'org_snapshot']);
    expect(plan.factsQueryTypes).toEqual(['org_structure']);
  });

  it('falls back to speaker+transcript when LLM output is invalid', async () => {
    llmBridge.createChatModel.mockResolvedValue({
      invoke: jest.fn().mockResolvedValue(new AIMessage('not json at all')),
    });
    const plan = await service.planGrounding({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '你好',
      messageId: 'm4',
    });
    expect(plan.source).toBe('llm_fallback');
    expect(plan.prefetchBlocks).toEqual(['speaker', 'transcript']);
  });

  it('rejects empty user text', async () => {
    await expect(
      service.planGrounding({
        companyId: 'co1',
        roomContext: baseRoom(),
        contentText: '   ',
        messageId: 'm5',
      }),
    ).rejects.toThrow('context_grounding_empty_user_text');
  });

  it('rejects non-main room', async () => {
    await expect(
      service.planGrounding({
        companyId: 'co1',
        roomContext: baseRoom({ roomType: 'department' }),
        contentText: 'hi',
        messageId: 'm6',
      }),
    ).rejects.toThrow('context_grounding_main_room_only');
  });
});
