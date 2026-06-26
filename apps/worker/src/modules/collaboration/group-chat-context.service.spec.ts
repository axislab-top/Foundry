import { of } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { GroupChatContextService } from './group-chat-context.service.js';

describe('GroupChatContextService', () => {
  const mkSvc = (deps: { config: any; ceoLayerConfigResolver: any; apiRpc: any; agentsDirectoryCache?: any }) => {
    const convStateCache = { getSnapshot: jest.fn(async () => null), setSnapshot: jest.fn(async () => void 0) } as any;
    const monitoring = {
      incCollabConversationStateCache: jest.fn(),
      observeCollabClassifierHydrateMs: jest.fn(),
      incCollaborationDirectAgentMemoryInject: jest.fn(),
    } as any;
    const agentsDirectoryCache =
      deps.agentsDirectoryCache ??
      ({
        getActiveAgents: jest.fn(async () => []),
      } as any);
    const mergedConfig = {
      getCollaborationMentionRpcTimeoutMs: () => 5000,
      isCollabProfileFollowupSuppressQuick: () => false,
      ...deps.config,
    };
    return new GroupChatContextService(
      mergedConfig,
      deps.ceoLayerConfigResolver,
      convStateCache,
      monitoring,
      agentsDirectoryCache,
      deps.apiRpc,
    );
  };

  it('buildRoomMembersBlock formats member rows', async () => {
    const config = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
      getEnableHumanIdentityForAllAgents: () => false,
    } as unknown as ConfigService;
    const ceoLayerConfigResolver = { resolveLayerSetting: jest.fn(), getConfig: jest.fn() } as any;
    const apiRpc = {
      send: jest.fn().mockReturnValue(
        of([
          { memberType: 'human', memberId: 'u1' },
          { memberType: 'agent', memberId: 'a1' },
        ]),
      ),
    } as any;
    const svc = mkSvc({ config, ceoLayerConfigResolver, apiRpc });
    const text = await svc.buildRoomMembersBlock({
      companyId: 'c1',
      roomId: 'r1',
      timeoutMs: 5000,
    });
    expect(text).toContain('human: u1');
    expect(text).toContain('agent: a1');
    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.members.list',
      expect.objectContaining({ roomId: 'r1' }),
    );
  });

  it('uses per-layer historyMessagesLimit for transcript size', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      isGroupChatMemoryRetrievalEnabled: () => false,
      getGroupChatMemoryRetrievalTopK: () => 3,
      getCollabDirectReplyHistoryLimit: () => 12,
      getEnableHumanIdentityForAllAgents: () => false,
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ historyMessagesLimit: 3, enableMemoryRetrieval: false })),
      getConfig: jest.fn(async () => ({ enableMemoryRetrieval: false })),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.list') {
          return of({
            items: Array.from({ length: 20 }).map((_, i) => ({
              id: `m${i}`,
              content: `hi-${i}`,
              senderType: i % 2 === 0 ? 'human' : 'agent',
              messageType: 'text',
              threadId: null,
            })),
          });
        }
        if (pattern === 'collaboration.members.list') {
          return of([{ memberType: 'human', memberId: 'u1' }]);
        }
        return of([]);
      }),
    } as any;
    const svc = mkSvc({ config, ceoLayerConfigResolver, apiRpc });
    const out = await svc.buildAuxiliaryContextForReply({
      companyId: 'c1',
      roomId: 'r1',
      latestUserText: 'hello',
      excludeMessageId: 'm999',
      timeoutMs: 5000,
      ceoContext: 'orchestration',
      enableMemoryRetrieval: true,
    });
    expect(ceoLayerConfigResolver.resolveLayerSetting).toHaveBeenCalledWith('c1', 'orchestration');
    expect(out.transcript.length).toBe(3);
  });

  it('loads multiple company profile sections when requested', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      isGroupChatMemoryRetrievalEnabled: () => false,
      getGroupChatMemoryRetrievalTopK: () => 3,
      getCollabDirectReplyHistoryLimit: () => 12,
      getEnableHumanIdentityForAllAgents: () => false,
      getWorkerDirectAgentDefaultInjectCompanyProfile: () => true,
      getWorkerDirectAgentDefaultInjectRecentTranscript: () => true,
      getWorkerDirectAgentTranscriptMessageCount: () => 10,
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => null),
      getConfig: jest.fn(async () => ({ enableMemoryRetrieval: null })),
      getDirectAgentMemoryInjectConfig: jest.fn(async () => ({
        injectCompanyProfile: true,
        injectRecentTranscript: true,
        transcriptMessageCount: 10,
      })),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string, payload: any) => {
        if (pattern === 'memory.companyProfile.get') {
          // echo section in text so we can assert ordering
          return of({ text: `sec=${payload.section}`, generatedAt: 't1' });
        }
        if (pattern === 'collaboration.messages.list') return of({ items: [] });
        if (pattern === 'collaboration.members.list') return of([]);
        return of([]);
      }),
    } as any;
    const svc = mkSvc({ config, ceoLayerConfigResolver, apiRpc });
    const out = await svc.buildAuxiliaryContextForReply({
      companyId: 'c1',
      roomId: 'r1',
      latestUserText: 'hello',
      excludeMessageId: 'm0',
      timeoutMs: 5000,
      ceoContext: 'orchestration',
      enableMemoryRetrieval: false,
      companyProfileSections: ['overview', 'org'],
    });
    expect(out.auxiliarySystemText).toContain('sec=overview');
    expect(out.auxiliarySystemText).toContain('sec=org');
    expect(apiRpc.send).toHaveBeenCalledWith(
      'memory.companyProfile.get',
      expect.objectContaining({ section: 'overview' }),
    );
    expect(apiRpc.send).toHaveBeenCalledWith(
      'memory.companyProfile.get',
      expect.objectContaining({ section: 'org' }),
    );
  });

  it('keeps raw recent messages when transcript summary exists', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      isGroupChatMemoryRetrievalEnabled: () => false,
      getGroupChatMemoryRetrievalTopK: () => 3,
      getCollabDirectReplyHistoryLimit: () => 12,
      getEnableHumanIdentityForAllAgents: () => false,
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ historyMessagesLimit: 3, enableMemoryRetrieval: false })),
      getConfig: jest.fn(async () => ({ enableMemoryRetrieval: false })),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.list') {
          return of({
            items: [
              { id: 'm1', content: '当前这个群里共有 2 人。', senderType: 'agent', messageType: 'text', threadId: null },
              { id: 'm2', content: '请叫出他们的名字', senderType: 'human', messageType: 'text', threadId: null },
            ],
          });
        }
        if (pattern === 'collaboration.members.list') return of([]);
        return of([]);
      }),
    } as any;
    const svc = mkSvc({ config, ceoLayerConfigResolver, apiRpc });
    const out = await svc.buildAuxiliaryContextForReply({
      companyId: 'c1',
      roomId: 'r1',
      latestUserText: '请叫出他们的名字',
      excludeMessageId: 'm3',
      timeoutMs: 5000,
      ceoContext: 'orchestration',
      enableMemoryRetrieval: false,
      l1DecisionContext: {
        transcriptSummary: '用户在追问上一轮提到的人名',
      } as any,
    });

    expect(out.transcript.length).toBeGreaterThan(1);
    expect(String((out.transcript[0] as any).content)).toContain('L1 transcript summary');
    expect(String((out.transcript[1] as any).content)).toContain('当前这个群里共有 2 人');
  });

  it('group-chat-context-memory-retrieval-alignment', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      isGroupChatMemoryRetrievalEnabled: () => true,
      getGroupChatMemoryRetrievalTopK: () => 3,
      getCollabDirectReplyHistoryLimit: () => 12,
      getEnableHumanIdentityForAllAgents: () => false,
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ historyMessagesLimit: 2, enableMemoryRetrieval: false })),
      getConfig: jest.fn(async () => ({ enableMemoryRetrieval: false })),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.list') {
          return of({
            items: [
              { id: 'm1', content: 'a', senderType: 'human', messageType: 'text', threadId: null },
              { id: 'm2', content: 'b', senderType: 'agent', messageType: 'text', threadId: null },
            ],
          });
        }
        if (pattern === 'collaboration.members.list') return of([]);
        if (pattern === 'memory.search') return of([{ id: 'mem1', content: 'x', score: 0.9 }]);
        return of([]);
      }),
    } as any;
    const svc = mkSvc({ config, ceoLayerConfigResolver, apiRpc });
    await svc.buildAuxiliaryContextForReply({
      companyId: 'c1',
      roomId: 'r1',
      latestUserText: 'q',
      excludeMessageId: 'm0',
      timeoutMs: 5000,
      ceoContext: 'orchestration',
      enableMemoryRetrieval: true,
    });
    // Note: conversation-state restoration can perform memory.search even when reply memory retrieval is disabled.
    // This test only asserts that per-layer enableMemoryRetrieval=false prevents the *reply* memory retrieval block.
    expect(apiRpc.send).not.toHaveBeenCalledWith(
      'memory.search',
      expect.objectContaining({ data: expect.objectContaining({ query: 'q' }) }),
    );
  });

  it('enables memory retrieval when per-layer enableMemoryRetrieval=true', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      isGroupChatMemoryRetrievalEnabled: () => true,
      getGroupChatMemoryRetrievalTopK: () => 3,
      getCollabDirectReplyHistoryLimit: () => 12,
      getEnableHumanIdentityForAllAgents: () => false,
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ historyMessagesLimit: 2, enableMemoryRetrieval: true })),
      getConfig: jest.fn(async () => ({ enableMemoryRetrieval: true })),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.list') return of({ items: [] });
        if (pattern === 'collaboration.members.list') return of([]);
        if (pattern === 'agents.departmentSharingContext')
          return of({
            role: 'director',
            departmentSlug: 'sales',
            departmentOrganizationNodeId: '00000000-0000-4000-8000-000000000001',
            allowDeptSharedMemory: true,
            allowDeptSharedSkills: false,
          });
        if (pattern === 'memory.search') return of([{ id: 'mem1', content: 'x', score: 0.9 }]);
        return of([]);
      }),
    } as any;
    const svc = mkSvc({ config, ceoLayerConfigResolver, apiRpc });
    await svc.buildAuxiliaryContextForReply({
      companyId: 'c1',
      roomId: 'r1',
      agentId: 'a1',
      latestUserText: 'q',
      excludeMessageId: 'm0',
      timeoutMs: 5000,
      ceoContext: 'orchestration',
      enableMemoryRetrieval: false,
    });
    expect(apiRpc.send).toHaveBeenCalledWith(
      'memory.search',
      expect.objectContaining({
        data: expect.objectContaining({
          roomId: 'r1',
          namespaces: ['agent:a1', 'department:sales'],
        }),
      }),
    );
  });

  it('P2.2: direct summon prepends 【公司画像】 and 【最近对话】 and skips duplicate overview profile fetch', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCollaborationMentionRpcTimeoutMs: () => 5000,
      isCollabProfileFollowupSuppressQuick: () => false,
      isGroupChatMemoryRetrievalEnabled: () => false,
      getGroupChatMemoryRetrievalTopK: () => 3,
      getCollabDirectReplyHistoryLimit: () => 12,
      getEnableHumanIdentityForAllAgents: () => false,
      getWorkerDirectAgentDefaultInjectCompanyProfile: () => true,
      getWorkerDirectAgentDefaultInjectRecentTranscript: () => true,
      getWorkerDirectAgentTranscriptMessageCount: () => 4,
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ historyMessagesLimit: 8, enableMemoryRetrieval: false })),
      getConfig: jest.fn(async () => ({ enableMemoryRetrieval: false })),
      getDirectAgentMemoryInjectConfig: jest.fn(async () => ({
        injectCompanyProfile: true,
        injectRecentTranscript: true,
        transcriptMessageCount: 4,
      })),
    } as any;
    const monitoring = {
      incCollabConversationStateCache: jest.fn(),
      observeCollabClassifierHydrateMs: jest.fn(),
      incCollaborationDirectAgentMemoryInject: jest.fn(),
    } as any;
    const convStateCache = { getSnapshot: jest.fn(async () => null), setSnapshot: jest.fn(async () => void 0) } as any;
    const apiRpc = {
      send: jest.fn((pattern: string, payload: any) => {
        if (pattern === 'memory.companyProfile.get') {
          return of({ text: '我们是一家做协作 Agents 的公司', generatedAt: 't1' });
        }
        if (pattern === 'memory.companyProfile.sync') return of({});
        if (pattern === 'collaboration.messages.list') {
          return of({
            items: [
              { id: 'm1', content: '大家好', senderType: 'human', messageType: 'text', threadId: null },
              { id: 'm2', content: '我在', senderType: 'agent', messageType: 'text', threadId: null },
              { id: 'm3', content: '@销售 请回复', senderType: 'human', messageType: 'text', threadId: null },
              { id: 'm4', content: '收到', senderType: 'agent', messageType: 'text', threadId: null },
            ],
          });
        }
        if (pattern === 'collaboration.members.list') return of([]);
        if (pattern === 'agents.findAll') return of({ items: [] });
        if (pattern === 'agents.effectiveSkillSnapshots') return of({ skills: [] });
        if (pattern === 'companies.findOne') return of({ name: 'DemoCo' });
        return of([]);
      }),
    } as any;
    const agentsDirectoryCache = {
      getActiveAgents: jest.fn(async () => []),
    } as any;
    const svc = new GroupChatContextService(
      config,
      ceoLayerConfigResolver,
      convStateCache,
      monitoring,
      agentsDirectoryCache,
      apiRpc,
    );
    const out = await svc.buildAuxiliaryContextForReply({
      companyId: 'c1',
      roomId: 'r1',
      agentId: 'a1',
      latestUserText: 'ping',
      excludeMessageId: 'm9',
      timeoutMs: 5000,
      ceoContext: 'orchestration',
      enableMemoryRetrieval: false,
      intentDecision2026_1: {
        intentType: 'direct_summon',
        confidence: 0.9,

        routingHints: { shouldExecute: true, riskLevel: 'low', targetAgentIds: ['a1'] },
      } as any,
      directSummonOptions: { isDirectSummoned: true, targetAgentId: 'a1' },
    });
    const t = out.auxiliarySystemText;
    const iReply = t.indexOf('【Reply Facts】');
    /** 与直聊摘要标题「【公司画像 — 直聊摘要】」前缀对齐（全角破折号，非「】」紧跟「像」）。 */
    const iProf = t.indexOf('【公司画像');
    /** 与「【最近对话 — 节选】」前缀对齐。 */
    const iRecent = t.indexOf('【最近对话');
    expect(iReply).toBeGreaterThan(-1);
    expect(iProf).toBeGreaterThan(iReply);
    expect(iRecent).toBeGreaterThan(iProf);
    expect(t).toContain('我们是一家做协作 Agents 的公司');
    expect(t).toContain('- human:');
    const profileGetCalls = (apiRpc.send as jest.Mock).mock.calls.filter((c) => c[0] === 'memory.companyProfile.get');
    expect(profileGetCalls.length).toBe(1);
    expect(monitoring.incCollaborationDirectAgentMemoryInject).toHaveBeenCalledWith({
      type: 'company_profile',
      status: 'hit',
    });
    expect(monitoring.incCollaborationDirectAgentMemoryInject).toHaveBeenCalledWith({
      type: 'transcript',
      status: 'hit',
    });
  });

  it('P2.2: mis-tagged directSummon without matching targetAgentIds does not inject summon blocks', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCollaborationMentionRpcTimeoutMs: () => 5000,
      isCollabProfileFollowupSuppressQuick: () => false,
      isGroupChatMemoryRetrievalEnabled: () => false,
      getGroupChatMemoryRetrievalTopK: () => 3,
      getCollabDirectReplyHistoryLimit: () => 12,
      getEnableHumanIdentityForAllAgents: () => false,
      getWorkerDirectAgentDefaultInjectCompanyProfile: () => true,
      getWorkerDirectAgentDefaultInjectRecentTranscript: () => true,
      getWorkerDirectAgentTranscriptMessageCount: () => 4,
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ historyMessagesLimit: 8, enableMemoryRetrieval: false })),
      getConfig: jest.fn(async () => ({ enableMemoryRetrieval: false })),
      getDirectAgentMemoryInjectConfig: jest.fn(),
    } as any;
    const monitoring = {
      incCollabConversationStateCache: jest.fn(),
      observeCollabClassifierHydrateMs: jest.fn(),
      incCollaborationDirectAgentMemoryInject: jest.fn(),
    } as any;
    const convStateCache = { getSnapshot: jest.fn(async () => null), setSnapshot: jest.fn(async () => void 0) } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.list') {
          return of({ items: [{ id: 'm1', content: 'x', senderType: 'human', messageType: 'text', threadId: null }] });
        }
        if (pattern === 'collaboration.members.list') return of([]);
        if (pattern === 'memory.companyProfile.get') return of({ text: 'should-not-inject', generatedAt: 't' });
        if (pattern === 'agents.findAll') return of({ items: [] });
        if (pattern === 'agents.effectiveSkillSnapshots') return of({ skills: [] });
        if (pattern === 'companies.findOne') return of({ name: 'DemoCo' });
        return of([]);
      }),
    } as any;
    const agentsDirectoryCache = {
      getActiveAgents: jest.fn(async () => []),
    } as any;
    const svc = new GroupChatContextService(
      config,
      ceoLayerConfigResolver,
      convStateCache,
      monitoring,
      agentsDirectoryCache,
      apiRpc,
    );
    await svc.buildAuxiliaryContextForReply({
      companyId: 'c1',
      roomId: 'r1',
      agentId: 'a1',
      latestUserText: 'ping',
      excludeMessageId: 'm9',
      timeoutMs: 5000,
      ceoContext: 'orchestration',
      enableMemoryRetrieval: false,
      intentDecision2026_1: {

        routingHints: {},
      } as any,
      directSummonOptions: { isDirectSummoned: true, targetAgentId: 'a1' },
    });
    expect(ceoLayerConfigResolver.getDirectAgentMemoryInjectConfig).not.toHaveBeenCalled();
    expect(monitoring.incCollaborationDirectAgentMemoryInject).not.toHaveBeenCalled();
  });

  it('buildReplyFacts sends agents.effectiveSkillSnapshots with id (AgentsIdRpcDto contract)', async () => {
    const agentUuid = '6af34396-4aba-4129-8ee0-18ccbb4b1c57';
    const companyUuid = '37adb187-ef61-4990-8a4f-3891a411a29d';
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'companies.findOne') return of({ name: 'Co' });
        if (pattern === 'agents.effectiveSkillSnapshots') return of({ skills: [] });
        return of({});
      }),
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ modelName: 'glm' })),
    } as any;
    const svc = mkSvc({
      config: { getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001' },
      ceoLayerConfigResolver,
      apiRpc,
    });
    await svc.buildReplyFacts(companyUuid, agentUuid);
    const snapCall = (apiRpc.send as jest.Mock).mock.calls.find((c) => c[0] === 'agents.effectiveSkillSnapshots');
    expect(snapCall).toBeDefined();
    expect(snapCall![1]).toEqual(
      expect.objectContaining({
        companyId: companyUuid,
        id: agentUuid,
      }),
    );
    expect(snapCall![1]).not.toHaveProperty('agentId');
  });

  it('buildIntentAudienceRoutingTranscriptBlock includes agent turns with shorter per-line clip than human', async () => {
    const longAgentBody = 'x'.repeat(500);
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern !== 'collaboration.messages.list') return of({});
        return of({
          items: [
            { id: '1', content: 'hi user', senderType: 'human', threadId: null },
            { id: '2', content: longAgentBody, senderType: 'agent', threadId: null },
            { id: '3', content: 'other colleague question', senderType: 'human', threadId: null },
          ],
        });
      }),
    } as any;
    const ceoLayerConfigResolver = { resolveLayerSetting: jest.fn() } as any;
    const svc = mkSvc({
      config: {
        getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
        getWorkerDirectAgentTranscriptMessageCount: () => 10,
      },
      ceoLayerConfigResolver,
      apiRpc,
    });
    const bundle = await svc.buildIntentAudienceRoutingTranscriptBlock({
      companyId: 'c1',
      roomId: 'r1',
      threadId: null,
      timeoutMs: 5000,
    });
    expect(bundle.digest).toMatch(/人类与 agent/);
    expect(bundle.digest).toContain('- agent:');
    expect(bundle.digest).toContain('- human:');
    const agentLine = bundle.digest.split('\n').find((l) => l.startsWith('- agent:'));
    expect(agentLine).toBeDefined();
    expect(agentLine!.length).toBeLessThanOrEqual('- agent: '.length + 140 + 4);
    expect(bundle.recentTurnFacts.lastPersistedRoomMessage?.messageId).toBe('3');
  });

  it('buildIntentAudienceRoutingTranscriptBlock excludeMessageId yields prior agent as lastPersistedRoomMessage', async () => {
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern !== 'collaboration.messages.list') return of({});
        return of({
          items: [
            { id: 'a1', content: '到，销售在', senderType: 'agent', senderId: 'agent-sales', threadId: null },
            { id: 'cur', content: '刚才怎么不理我', senderType: 'human', senderId: 'u424', threadId: null },
          ],
        });
      }),
    } as any;
    const ceoLayerConfigResolver = { resolveLayerSetting: jest.fn() } as any;
    const svc = mkSvc({
      config: {
        getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
        getWorkerDirectAgentTranscriptMessageCount: () => 10,
      },
      ceoLayerConfigResolver,
      apiRpc,
    });
    const bundle = await svc.buildIntentAudienceRoutingTranscriptBlock({
      companyId: 'c1',
      roomId: 'r1',
      threadId: null,
      excludeMessageId: 'cur',
      timeoutMs: 5000,
    });
    expect(bundle.recentTurnFacts.lastPersistedRoomMessage?.messageId).toBe('a1');
    expect(bundle.recentTurnFacts.lastPersistedRoomMessage?.senderId).toBe('agent-sales');
    expect(bundle.recentTurnFacts.lastPersistedRoomMessage?.senderType).toBe('agent');
  });
});
