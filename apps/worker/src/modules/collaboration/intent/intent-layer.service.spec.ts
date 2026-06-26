import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AIMessage } from '@langchain/core/messages';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from '../collaboration-llm-bridge.service.js';
import { CeoLayerConfigResolverService } from '../ceo/resolver/ceo-layer-config-resolver.service.js';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import { IntentLayerService } from './intent-layer.service.js';

describe('IntentLayerService（前置路由 / Mock LLM）', () => {
  let service: IntentLayerService;
  let llmBridge: { createChatModel: jest.Mock };
  let ceoResolver: { resolveLayerSetting: jest.Mock };

  function baseRoom(over?: Partial<RoomContext>): RoomContext {
    return {
      companyId: 'co1',
      roomId: 'room1',
      roomType: 'main',
      roomName: 'Main',
      organizationNodeId: null,
      members: [
        { memberType: 'human', memberId: 'u1' },
        { memberType: 'agent', memberId: 'agent-1-in-room' },
      ],
      memberDirectory: [],
      orgSnapshot: { departments: [], updatedAt: new Date().toISOString() },
      ...over,
    };
  }

  beforeEach(async () => {
    llmBridge = { createChatModel: jest.fn() };
    ceoResolver = { resolveLayerSetting: jest.fn().mockResolvedValue({ modelName: 'gpt-4o-mini' }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        IntentLayerService,
        {
          provide: ConfigService,
          useValue: {
            getCeoDecisionLlmTimeoutMs: jest.fn(() => 120_000),
            getCollabMainRoomMaxDirectTargets: jest.fn(() => 16),
          },
        },
        { provide: CollaborationLlmBridgeService, useValue: llmBridge },
        { provide: CeoLayerConfigResolverService, useValue: ceoResolver },
      ],
    }).compile();
    service = moduleRef.get(IntentLayerService);
  });

  function mockLlmReturnsJson(obj: unknown) {
    const text = JSON.stringify(obj);
    llmBridge.createChatModel.mockResolvedValue({
      invoke: jest.fn().mockResolvedValue(new AIMessage(text)),
    });
  }

  it('无 target：CEO 线、中等风险', async () => {
    mockLlmReturnsJson({
      confidence: 0.92,
      explanation: '轻量问',
      targetAgentIds: [],
    });
    const out = await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '群里现在有几个人',
      messageId: 'm1',
      traceId: 't1',
    });
    expect(out.intentType).toBe('audience_resolution');
    expect(out.routingHints.shouldExecute).toBe(false);
    expect(out.routingHints.riskLevel).toBe('medium');
    expect(out.targetDepartmentSlugs).toEqual([]);
    expect(out.metadata?.primaryAudience).toBe('ceo_line');
    expect(out.routingHints.targetAgentIds).toBeUndefined();
  });

  it('@ 房内非 CEO agent：强直连、不调 LLM', async () => {
    const out = await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '@销售 说说',
      originalContentText: '@销售 说说',
      messageId: 'm2',
      mentionedAgentIds: ['agent-1-in-room'],
      ceoAgentId: null,
    });
    expect(llmBridge.createChatModel).not.toHaveBeenCalled();
    expect(out.routingHints.explicitDirectTargets).toBe(true);
    expect(out.routingHints.targetAgentIds).toEqual(['agent-1-in-room']);
    expect(out.routingHints.riskLevel).toBe('low');
    expect(out.metadata?.primaryAudience).toBe('in_room_agents');
    expect(out.metadata?.source).toBe('audience_routing_deterministic_mention');
  });

  it('LLM 给的 id 不在房内：不写 targetAgentIds', async () => {
    mockLlmReturnsJson({
      confidence: 0.9,
      explanation: '模型猜 id',
      targetAgentIds: ['ghost-agent-not-in-room'],
    });
    const out = await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '让销售说说',
      originalContentText: '让销售说说',
      messageId: 'm3',
    });
    expect(out.routingHints.targetAgentIds).toBeUndefined();
    expect(out.metadata?.primaryAudience).toBe('ceo_line');
  });

  it('LLM 仅输出 targetAgentIds（无 confidence/explanation）：Zod 默认后采纳', async () => {
    mockLlmReturnsJson({ targetAgentIds: ['agent-1-in-room'] });
    const out = await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '请销售同事补充',
      originalContentText: '请销售同事补充',
      messageId: 'm4b',
    });
    expect(out.routingHints.explicitDirectTargets).toBe(true);
    expect(out.routingHints.targetAgentIds).toEqual(['agent-1-in-room']);
  });

  it('LLM 提供房内 roster id：采纳', async () => {
    mockLlmReturnsJson({
      confidence: 0.9,
      explanation: '模型指名',
      targetAgentIds: ['agent-1-in-room'],
    });
    const out = await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '请销售同事补充',
      originalContentText: '请销售同事补充',
      messageId: 'm4',
    });
    expect(out.routingHints.explicitDirectTargets).toBe(true);
    expect(out.routingHints.targetAgentIds).toEqual(['agent-1-in-room']);
    expect(out.metadata?.primaryAudience).toBe('in_room_agents');
  });

  it('LLM 房内 grounding id：置信度低于 0.85 但 ≥0.78 仍采纳', async () => {
    mockLlmReturnsJson({
      confidence: 0.79,
      explanation: '模型略保守',
      targetAgentIds: ['agent-1-in-room'],
    });
    const out = await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '销售那边补充一句',
      originalContentText: '销售那边补充一句',
      messageId: 'm4-grounded-low-conf',
    });
    expect(out.routingHints.explicitDirectTargets).toBe(true);
    expect(out.routingHints.targetAgentIds).toEqual(['agent-1-in-room']);
  });

  it('LLM 房内 grounding id：置信度 <0.78 不采纳', async () => {
    mockLlmReturnsJson({
      confidence: 0.77,
      explanation: '过低',
      targetAgentIds: ['agent-1-in-room'],
    });
    const out = await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '销售那边补充一句',
      originalContentText: '销售那边补充一句',
      messageId: 'm4-grounded-below-floor',
    });
    expect(out.routingHints.targetAgentIds).toBeUndefined();
    expect(out.metadata?.primaryAudience).toBe('ceo_line');
  });

  it('公司有哪些部门：确定性走 CEO 线、不调 LLM', async () => {
    const room = baseRoom({
      members: [
        { memberType: 'human', memberId: 'u1' },
        { memberType: 'agent', memberId: 'dir-a' },
        { memberType: 'agent', memberId: 'dir-b' },
      ],
      memberDirectory: [
        { memberType: 'agent', memberId: 'dir-a', displayName: 'A', roleLabel: '销售总监' },
        { memberType: 'agent', memberId: 'dir-b', displayName: 'B', roleLabel: '市场总监' },
      ],
    });
    const out = await service.recognizeIntent({
      companyId: 'co1',
      roomContext: room,
      contentText: '再看一遍，我公司有哪些部门',
      originalContentText: '再看一遍，我公司有哪些部门',
      messageId: 'm-org',
    });
    expect(llmBridge.createChatModel).not.toHaveBeenCalled();
    expect(out.routingHints.targetAgentIds).toBeUndefined();
    expect(out.routingHints.explicitDirectTargets).toBeUndefined();
    expect(out.metadata?.primaryAudience).toBe('ceo_line');
    expect(out.metadata?.source).toBe('audience_routing_deterministic_org_listing');
  });

  it('CEO 交办且无 @ 非 CEO：走受众路由 LLM（全模型路径）', async () => {
    mockLlmReturnsJson({
      targetAgentIds: [],
      confidence: 0.92,
      explanation: 'ceo_delegation_coordination',
    });
    const out = await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: 'CEO，安排个活，做一个关于api中转站的可行性文案，我要发小红书',
      originalContentText: 'CEO，安排个活，做一个关于api中转站的可行性文案，我要发小红书',
      messageId: 'm-ceo-delegation',
      ceoAgentId: 'ceo-x',
    });
    expect(llmBridge.createChatModel).toHaveBeenCalled();
    expect(out.routingHints.targetAgentIds).toBeUndefined();
    expect(out.metadata?.source).toBe('audience_routing_llm');
    expect(out.metadata?.primaryAudience).toBe('ceo_line');
  });

  it('@ 仅在房外：走 LLM；置信度 <0.85 时不触发强直连', async () => {
    mockLlmReturnsJson({
      confidence: 0.84,
      explanation: '低置信',
    });
    const out = await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '说说',
      messageId: 'm6',
      mentionedAgentIds: ['not-in-room-agent'],
    });
    expect(llmBridge.createChatModel).toHaveBeenCalled();
    expect(out.routingHints.explicitDirectTargets).toBeUndefined();
    expect(out.routingHints.targetAgentIds).toBeUndefined();
  });

  it('LLM 两次解析失败：graceful fallback 到 CEO 线（不抛异常）', async () => {
    llmBridge.createChatModel.mockResolvedValue({
      invoke: jest.fn().mockResolvedValue(new AIMessage('not valid json at all!!!')),
    });
    const out = await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '帮我做点事情',
      messageId: 'm-fallback',
    });
    expect(out.intentType).toBe('audience_resolution');
    expect(out.routingHints.targetAgentIds).toBeUndefined();
    expect(out.metadata?.source).toBe('audience_routing_llm_fallback');
    expect(out.confidence).toBe(0.5);
  });

  it('debug：LLM 返回空 target 时打 normalize_no_handoff_after_llm（dropReason）', async () => {
    mockLlmReturnsJson({ targetAgentIds: [], confidence: 0.85, explanation: 'ceo_line' });
    const dbg = jest.spyOn((service as unknown as { logger: Logger }).logger, 'debug');
    await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '是这样，我想问问你刚才为什么不理我',
      messageId: 'm-debug-nohandoff',
      traceId: 't-debug-nohandoff',
    });
    const hit = dbg.mock.calls.find((c) => String(c[0]) === 'audience_routing.normalize_no_handoff_after_llm');
    expect(hit).toBeDefined();
    expect(hit?.[1]).toMatchObject({
      dropReason: 'llm_empty_target_agent_ids',
      rawLlmTargetAgentIds: [],
      confidence: 0.85,
    });
    dbg.mockRestore();
  });

  it('debug/log：首轮模型输出打 llm_primary_raw 与 llm_primary_parsed', async () => {
    mockLlmReturnsJson({ targetAgentIds: [], confidence: 0.85 });
    const dbg = jest.spyOn((service as unknown as { logger: Logger }).logger, 'debug');
    const log = jest.spyOn((service as unknown as { logger: Logger }).logger, 'log');
    await service.recognizeIntent({
      companyId: 'co1',
      roomContext: baseRoom(),
      contentText: '追问',
      messageId: 'm-debug-parsed',
      traceId: 't-debug-parsed',
    });
    expect(dbg.mock.calls.some((c) => String(c[0]) === 'audience_routing.llm_primary_raw')).toBe(true);
    const parsedHit = log.mock.calls.find((c) => String(c[0]) === 'audience_routing.llm_primary_parsed');
    expect(parsedHit).toBeDefined();
    expect(parsedHit?.[1]).toMatchObject({
      messageId: 'm-debug-parsed',
      targetAgentIds: [],
      confidence: 0.85,
    });
    dbg.mockRestore();
    log.mockRestore();
  });
});
