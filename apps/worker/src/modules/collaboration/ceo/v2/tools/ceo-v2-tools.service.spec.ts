import { CeoV2ToolsService } from './ceo-v2-tools.service.js';

describe('CeoV2ToolsService', () => {
  function makeService(overrides?: { factsResult?: any; forceMemoryCortexOnly?: boolean }) {
    const capabilityPolicy = {
      allowedMemoryNamespaces: jest.fn(async () => ['company:c1:ceo:layer:L1']),
    } as any;
    const factsGateway = {
      query: jest.fn(async () => {
        if (overrides?.factsResult) return overrides.factsResult;
        return {
          queryType: 'room_members',
          generatedAt: new Date().toISOString(),
          counts: { roomMembers: 2 },
          roomMembers: [
            { memberType: 'human', memberId: 'u1', displayName: 'demo-user', role: 'human' },
            { memberType: 'agent', memberId: 'a1', displayName: 'Sales Director', role: 'sales_director' },
          ],
        };
      }),
    } as any;
    const memoryGateway = {
      queryScoped: jest.fn(async () => ({ generatedAt: new Date().toISOString(), hits: [] })),
    } as any;
    const llmBridge = {
      createChatModel: jest.fn(),
    } as any;
    const config = {
      getCeoStrategyModel: () => 'mimo-v2.5-pro',
      isForceMemoryCortexOnly: () => Boolean(overrides?.forceMemoryCortexOnly),
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ modelName: 'mimo-v2.5-pro' })),
    } as any;
    const service = new CeoV2ToolsService(
      capabilityPolicy,
      factsGateway,
      memoryGateway,
      llmBridge,
      config,
      ceoLayerConfigResolver,
    );
    return { service, factsGateway, llmBridge };
  }

  it('blocks facts and department tools when FORCE_MEMORY_CORTEX_ONLY', async () => {
    const { service, factsGateway } = makeService({ forceMemoryCortexOnly: true });
    const out = await service.executeTools({
      companyId: 'c1',
      roomId: 'r1',
      threadId: null,
      traceId: 't1',
      messageId: 'm0',
      ceoAgentId: 'ceo-1',
      humanSenderId: 'u1',
      toolCalls: [
        { id: 'tc-f', name: 'facts.company.query', args: { queryType: 'room_members' } },
        { id: 'tc-x', name: 'facts.any.future', args: {} },
        { id: 'tc-d', name: 'department.knowledge.query', args: { department: 'ops', query: 'q', topK: 3 } },
      ],
    });
    expect(out).toHaveLength(3);
    expect(out[0]?.ok).toBe(false);
    expect(String(out[0]?.error ?? '')).toContain('MEMORY_CORTEX_ONLY_TOOL_BLOCKED');
    expect(out[1]?.ok).toBe(false);
    expect(String(out[1]?.error ?? '')).toContain('MEMORY_CORTEX_ONLY_TOOL_BLOCKED');
    expect(out[2]?.ok).toBe(false);
    expect(factsGateway.query).not.toHaveBeenCalled();
  });

  it('keeps readable member names in facts summary', async () => {
    const { service } = makeService();
    const out = await service.executeTools({
      companyId: 'c1',
      roomId: 'r1',
      threadId: null,
      traceId: 't1',
      messageId: 'm1',
      ceoAgentId: 'ceo-1',
      humanSenderId: 'u1',
      toolCalls: [{ id: 'tc-1', name: 'facts.company.query', args: { queryType: 'room_members' } }],
    });
    expect(out).toHaveLength(1);
    const data = out[0]?.data as any;
    expect(String(data?.summary ?? '')).toContain('demo-user');
    expect(String(data?.summary ?? '')).toContain('Sales Director');
  });

  it('compresses oversized facts result into deterministic digest', async () => {
    const longMembers = Array.from({ length: 150 }).map((_, i) => ({
      memberType: i % 2 === 0 ? 'human' : 'agent',
      memberId: `id-${i}`,
      displayName: `member-${i}`,
      role: i % 2 === 0 ? 'human' : 'agent',
    }));
    const { service, llmBridge } = makeService({
      factsResult: {
        queryType: 'room_members',
        generatedAt: new Date().toISOString(),
        counts: { roomMembers: longMembers.length },
        roomMembers: longMembers,
      },
    });
    const out = await service.executeTools({
      companyId: 'c1',
      roomId: 'r1',
      threadId: null,
      traceId: 't1',
      messageId: 'm2',
      ceoAgentId: 'ceo-1',
      humanSenderId: 'u1',
      toolCalls: [{ id: 'tc-2', name: 'facts.company.query', args: { queryType: 'room_members' } }],
    });
    expect(out).toHaveLength(1);
    const data = out[0]?.data as any;
    expect(data?.summarized).toBe(true);
    expect(Array.isArray(data?.factsDigest?.roomMembers)).toBe(true);
    expect(data.factsDigest.roomMembers.length).toBeLessThanOrEqual(12);
    expect(llmBridge.createChatModel).not.toHaveBeenCalled();
  });
});

