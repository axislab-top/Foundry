import { FactsRpcController } from './facts.rpc.controller.js';

describe('FactsRpcController', () => {
  const UUID1 = '00000000-0000-4000-8000-000000000001';
  const UUID2 = '00000000-0000-4000-8000-000000000002';
  const UUID3 = '00000000-0000-4000-8000-000000000003';
  const tenantContext = {
    runWithCompanyId: async (_companyId: string, fn: any) => await fn(),
  } as any;

  const config = { isFactsAsFallbackOnlyEnabled: () => false } as any;

  const facts = {
    listRoomMembers: async () => [{ memberType: 'human', memberId: 'u1' }],
  } as any;

  const org = {
    getTree: async () => [{ id: 'n1', name: 'CEO', type: 'ceo' }],
  } as any;

  const memoryRetriever = {
    search: async () => [{ id: 'm1', content: 'hit', score: 0.9, namespace: 'company:c1:ceo:layer:L1' }],
  } as any;

  const agentsRepo = {
    find: async () => [{ id: 'a1', name: 'CEO', role: 'ceo', organizationNodeId: null, metadata: {} }],
  } as any;

  const membershipsRepo = {
    count: async () => 3,
  } as any;
  const usersRepo = {
    find: async () => [{ id: 'u1', username: 'demo-user' }],
  } as any;

  const controller = new FactsRpcController(
    tenantContext,
    config,
    facts,
    org,
    memoryRetriever,
    agentsRepo,
    membershipsRepo,
    usersRepo,
  );

  it('rejects memory.query.scoped when namespacesAllowed empty', async () => {
    await expect(
      controller.memoryQueryScoped({
        actor: { id: UUID1, roles: ['admin'] },
        companyId: UUID2,
        traceId: 't1',
        requester: { agentId: UUID3, role: 'ceo', departmentSlug: null, userId: null },
        namespacesAllowed: [],
        query: 'q',
        topK: 3,
        roomId: null,
      } as any),
    ).rejects.toBeTruthy();
  });

  it('requires roomId for facts.query room_members', async () => {
    await expect(
      controller.query({
        actor: { id: UUID1, roles: ['admin'] },
        companyId: UUID2,
        traceId: 't1',
        requester: { agentId: UUID3, role: 'ceo', departmentSlug: null, userId: null },
        queryType: 'room_members',
        roomId: null,
      } as any),
    ).rejects.toBeTruthy();
  });

  it('returns room_members list when roomId provided', async () => {
    const out = await controller.query({
      actor: { id: UUID1, roles: ['admin'] },
      companyId: UUID2,
      roomId: UUID3,
      threadId: null,
      traceId: 't1',
      requester: { agentId: UUID3, role: 'ceo', departmentSlug: null, userId: null },
      queryType: 'room_members',
      roleQuery: null,
      locale: null,
    } as any);
    expect(out.queryType).toBe('room_members');
    expect(Array.isArray(out.roomMembers)).toBe(true);
    expect((out.roomMembers as any[]).length).toBe(1);
  });
});

