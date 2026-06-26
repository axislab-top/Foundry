import { PreContextService } from './pre-context.service.js';

describe('PreContextService', () => {
  function makeService() {
    const config = {
      getWorkerActorUserId: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
      getCollaborationMentionRpcTimeoutMs: jest.fn(() => 1200),
      getCollabIntentModel: jest.fn(() => ''),
      getCeoClassifierModel: jest.fn(() => 'gpt'),
      getCollabIntentLlmTimeoutMs: jest.fn(() => 2000),
    } as any;
    const tenantContext = {
      runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<unknown>) => fn()),
    } as any;
    const groupChat = {
      buildHumanIdentityPack: jest.fn(async ({ companyId }: any) => ({
        telemetryLabel: `human:${companyId}`,
        compactLine: 'owner',
        block: 'identity',
      })),
    } as any;
    const ceoQueue = {
      send: jest.fn(async (pattern: string, payload: any) => {
        if (pattern === 'collaboration.messages.list') {
          return { items: [{ senderType: 'human', content: `hello-${payload.companyId}`, seq: 1 }] };
        }
        if (pattern === 'memory.search') return [];
        return null;
      }),
    } as any;
    const collabLlm = {
      createChatModel: jest.fn(async () => ({
        invoke: jest.fn(async () => ({ content: 'compressed fingerprint content' })),
      })),
    } as any;
    const ceoLayerResolver = {
      getCompanyConfigSnapshot: jest.fn(async () => null),
    } as any;
    const l1Flags = {
      isPreContextEnabled: jest.fn(async () => false),
    } as any;
    const agentsDirectoryCache = {
      getActiveAgents: jest.fn(async () => []),
    } as any;
    const svc = new PreContextService(
      config,
      tenantContext,
      groupChat,
      ceoQueue,
      collabLlm,
      ceoLayerResolver,
      l1Flags,
      agentsDirectoryCache,
    );
    return { svc, ceoQueue, tenantContext };
  }

  it('builds isolated context by company', async () => {
    const { svc, tenantContext } = makeService();
    const a = await svc.buildClassifierContext({
      companyId: 'company-a',
      roomId: 'room-1',
      messageId: 'm1',
      routingRootMessageId: 'm1',
      contentText: 'please sync project timeline',
      threadId: null,
      mentionedAgentIds: ['agent-1'],
      ceoAgentId: null,
      humanSenderId: 'user-1',
      recentInterlocutorAgentId: null,
      recentInterlocutorLastPreview: null,
      roomAgentRosterBrief: null,
    });
    const b = await svc.buildClassifierContext({
      companyId: 'company-b',
      roomId: 'room-1',
      messageId: 'm2',
      routingRootMessageId: 'm2',
      contentText: 'please sync project timeline',
      threadId: null,
      mentionedAgentIds: ['agent-1'],
      ceoAgentId: null,
      humanSenderId: 'user-1',
      recentInterlocutorAgentId: null,
      recentInterlocutorLastPreview: null,
      roomAgentRosterBrief: null,
    });
    expect(a.cacheKey).toContain('company:company-a:l1:pre_context:');
    expect(b.cacheKey).toContain('company:company-b:l1:pre_context:');
    expect(a.cacheKey).not.toBe(b.cacheKey);
    expect(tenantContext.runWithCompanyId).toHaveBeenCalledWith('company-a', expect.any(Function));
    expect(tenantContext.runWithCompanyId).toHaveBeenCalledWith('company-b', expect.any(Function));
  });

  it('keeps decision fingerprint compact', async () => {
    const { svc } = makeService();
    const out = await svc.buildClassifierContext({
      companyId: 'company-a',
      roomId: 'room-1',
      messageId: 'm3',
      routingRootMessageId: 'm3',
      contentText: 'a '.repeat(500),
      threadId: null,
      mentionedAgentIds: [],
      ceoAgentId: null,
      humanSenderId: 'user-1',
      recentInterlocutorAgentId: null,
      recentInterlocutorLastPreview: null,
      roomAgentRosterBrief: null,
    });
    expect(out.decisionFingerprint.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(200);
  });
});
