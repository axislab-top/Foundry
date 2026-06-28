import { of } from 'rxjs';
import { CompanyCortexService } from './company-cortex.service.js';

describe('CompanyCortexService', () => {
  function makeService() {
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'memory.companyProfile.get')
          return of({ text: '我们的产品是AI运营平台，目标客户是中型企业。' });
        if (pattern === 'memory.search') return of([{ content: '本季度目标是提升线索转化率。' }]);
        if (pattern === 'collaboration.members.list') return of([{ memberType: 'human', memberId: 'u1' }]);
        if (pattern === 'agents.findAll') return of({ items: [{ id: 'a1', role: 'ceo' }, { id: 'a2', role: 'sales' }] });
        if (pattern === 'memory.entries.store') return of({ id: 'mem-1' });
        return of({});
      }),
    } as any;
    const config = {
      getWorkerActorUserId: () => 'worker-user',
      getApiRpcTimeoutMs: () => 1500,
    } as any;
    return { service: new CompanyCortexService(apiRpc, config), apiRpc };
  }

  it('builds company brain context with profile and counts', async () => {
    const { service } = makeService();
    jest.spyOn(service as any, 'assessProfileFieldsWithLlm').mockResolvedValue({
      product: 'known',
      customer: 'known',
      goals: 'known',
      org: 'unknown',
      risk: 'unknown',
    });
    const out = await service.getCompanyBrainContext({
      companyId: 'c1',
      roomId: 'r1',
      userMessage: '我们公司这周重点是什么？',
    });
    expect(out.profileHit).toBe(true);
    expect(out.activeAgentCount).toBe(2);
    expect(out.roomMemberCount).toBe(1);
    expect(out.summary).toContain('company_profile');
  });

  it('uses unified L1 Strategy memory.search query tail (collaborative delivery blueprint)', async () => {
    const { service, apiRpc } = makeService();
    jest.spyOn(service as any, 'assessProfileFieldsWithLlm').mockResolvedValue({
      product: 'known',
      customer: 'known',
      goals: 'known',
      org: 'known',
      risk: 'known',
    });
    await service.getCompanyBrainContext({
      companyId: 'c1',
      roomId: 'r1',
      userMessage: '请撰写 PRD 初稿',
    });
    const searchCall = apiRpc.send.mock.calls.find((c: unknown[]) => c?.[0] === 'memory.search');
    expect(searchCall).toBeTruthy();
    const query = String((searchCall?.[1] as { query?: string })?.query ?? '');
    expect(query).toContain('请撰写 PRD 初稿');
    expect(query).toContain('collaboration');
    expect(query).toContain('handoffs');
    expect(query).not.toMatch(/strategy objective.*product customer/);
  });

  it('stores profile gap signal when missing fields exist', async () => {
    const { service, apiRpc } = makeService();
    await service.persistProfileGapSignal({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm1',
      missingFields: ['org', 'risk'],
      userMessage: '帮我梳理公司风险',
    });
    const storeCall = apiRpc.send.mock.calls.find((x: any[]) => x?.[0] === 'memory.entries.store');
    expect(storeCall).toBeTruthy();
    expect(storeCall?.[1]?.data?.metadata?.source).toBe('company_cortex.profile_gap');
  });

  it('treats undecided goals as known and not missing', async () => {
    const { service, apiRpc } = makeService();
    apiRpc.send.mockImplementation((pattern: string) => {
      if (pattern === 'memory.companyProfile.get') {
        return of({ text: '核心产品是Foundry，目标客户是创业者，本季度目标暂未定。' });
      }
      if (pattern === 'memory.search') return of([]);
      if (pattern === 'collaboration.members.list') return of([{ memberType: 'human', memberId: 'u1' }]);
      if (pattern === 'agents.findAll') return of({ items: [{ id: 'a1', role: 'ceo' }] });
      return of({});
    });
    jest.spyOn(service as any, 'assessProfileFieldsWithLlm').mockResolvedValue({
      product: 'known',
      customer: 'known',
      goals: 'undecided',
      org: 'known',
      risk: 'unknown',
    });
    const out = await service.getCompanyBrainContext({
      companyId: 'c1',
      roomId: 'r1',
      userMessage: '先看看公司画像',
    });
    expect(out.missingFields).not.toContain('goals');
  });

  it('skips profile gap LLM when includeProfileGapAssessment is false', async () => {
    const { service } = makeService();
    const assessSpy = jest.spyOn(service as any, 'assessProfileFieldsWithLlm');
    const out = await service.getCompanyBrainContext({
      companyId: 'c1',
      roomId: 'r1',
      userMessage: 'hello',
      includeProfileGapAssessment: false,
    });
    expect(assessSpy).not.toHaveBeenCalled();
    expect(out.missingFields).toEqual([]);
    assessSpy.mockRestore();
  });

  it('uses current user message to suppress already provided fields', async () => {
    const { service, apiRpc } = makeService();
    apiRpc.send.mockImplementation((pattern: string) => {
      if (pattern === 'memory.companyProfile.get') return of({ text: '' });
      if (pattern === 'memory.search') return of([]);
      if (pattern === 'collaboration.members.list') return of([]);
      if (pattern === 'agents.findAll') return of({ items: [] });
      return of({});
    });
    jest.spyOn(service as any, 'assessProfileFieldsWithLlm').mockResolvedValue({
      product: 'known',
      customer: 'known',
      goals: 'undecided',
      org: 'unknown',
      risk: 'unknown',
    });
    const out = await service.getCompanyBrainContext({
      companyId: 'c1',
      roomId: 'r1',
      userMessage: '我们的核心产品是Foundry，目标客户是创业者，季度目标暂未定。',
    });
    expect(out.missingFields).not.toContain('product');
    expect(out.missingFields).not.toContain('customer');
    expect(out.missingFields).not.toContain('goals');
  });

  it('getSyncedCompanyProfilePlaintext reads API `text` field (not legacy profile)', async () => {
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'memory.companyProfile.get') return of({ text: '公司名称：测试Co' });
        return of({});
      }),
    } as any;
    const config = { getWorkerActorUserId: () => 'w', getApiRpcTimeoutMs: () => 1500 } as any;
    const service = new CompanyCortexService(apiRpc, config);
    await expect(service.getSyncedCompanyProfilePlaintext('c1')).resolves.toContain('测试Co');
  });

  it('getSyncedCompanyProfilePlaintext falls back to legacy `profile` key if present', async () => {
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'memory.companyProfile.get') return of({ profile: 'legacy-only' });
        return of({});
      }),
    } as any;
    const config = { getWorkerActorUserId: () => 'w', getApiRpcTimeoutMs: () => 1500 } as any;
    const service = new CompanyCortexService(apiRpc, config);
    await expect(service.getSyncedCompanyProfilePlaintext('c1')).resolves.toBe('legacy-only');
  });
});
