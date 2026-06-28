import { CollaborationOrgSyncService } from './collaboration-org-sync.service.js';

describe('CollaborationOrgSyncService', () => {
  const companyId = 'c-1';
  const departmentNode = {
    id: 'dept-1',
    companyId,
    type: 'department' as const,
    name: '销售部',
    parentId: 'ceo-node',
    order: 0,
    metadata: {},
  };

  function buildService(overrides?: {
    agents?: Array<{ id: string; organizationNodeId: string | null; status: string }>;
    orgNodes?: Array<{ id: string; parentId: string | null; type: string }>;
  }) {
    const room = { id: 'room-dept', companyId, roomType: 'department', organizationNodeId: departmentNode.id };
    const rooms = {
      findMainRoom: jest.fn(async () => ({ id: 'room-main', companyId })),
      findDepartmentRoomByOrganizationNodeId: jest.fn(async () => null),
      findDepartmentRoomBySlug: jest.fn(async () => null),
      createRoom: jest.fn(async () => room),
    };
    const addMembers = jest.fn(async () => []);
    const members = { addMembers };
    const agentsRepo = {
      find: jest.fn(async () => overrides?.agents ?? []),
      findOne: jest.fn(),
    };
    const orgNodesRepo = {
      find: jest.fn(
        async () =>
          overrides?.orgNodes ?? [
            { id: 'ceo-node', parentId: null, type: 'ceo' },
            { id: departmentNode.id, parentId: 'ceo-node', type: 'department' },
            { id: 'agent-slot', parentId: departmentNode.id, type: 'agent' },
          ],
      ),
      findOne: jest.fn(async () => departmentNode),
    };
    const membershipsRepo = { find: jest.fn(async () => []) };

    const service = new CollaborationOrgSyncService(
      rooms as any,
      members as any,
      agentsRepo as any,
      orgNodesRepo as any,
      membershipsRepo as any,
    );

    return { service, rooms, addMembers, agentsRepo };
  }

  it('onAgentCreated adds executor to department room', async () => {
    const { service, addMembers } = buildService({
      agents: [{ id: 'exec-1', organizationNodeId: 'agent-slot', status: 'active' }],
    });

    await service.onAgentCreated(companyId, {
      agentId: 'exec-1',
      role: 'executor',
      status: 'active',
      organizationNodeId: 'agent-slot',
    });

    expect(addMembers).toHaveBeenCalledWith(
      companyId,
      'room-dept',
      expect.arrayContaining([{ memberType: 'agent', memberId: 'exec-1' }]),
    );
  });

  it('onAgentCreated adds ceo to main room', async () => {
    const { service, addMembers } = buildService();

    await service.onAgentCreated(companyId, {
      agentId: 'ceo-1',
      role: 'ceo',
      status: 'active',
      organizationNodeId: 'ceo-node',
    });

    expect(addMembers).toHaveBeenCalledWith(
      companyId,
      'room-main',
      [{ memberType: 'agent', memberId: 'ceo-1' }],
    );
  });

  it('onDepartmentNodeCreated adds resolved director to department and main rooms', async () => {
    const { service, addMembers, agentsRepo } = buildService();
    agentsRepo.findOne = jest.fn(async () => ({ id: 'dir-1' }));

    await service.onDepartmentNodeCreated(companyId, { ...departmentNode, agentId: null } as any);

    expect(addMembers).toHaveBeenCalledWith(
      companyId,
      'room-dept',
      [{ memberType: 'agent', memberId: 'dir-1' }],
    );
    expect(addMembers).toHaveBeenCalledWith(
      companyId,
      'room-main',
      [{ memberType: 'agent', memberId: 'dir-1' }],
    );
  });

  it('onDepartmentNodeCreated uses headAgentId when provided', async () => {
    const { service, addMembers } = buildService();

    await service.onDepartmentNodeCreated(companyId, departmentNode as any, {
      headAgentId: 'dir-explicit',
    });

    expect(addMembers).toHaveBeenCalledWith(
      companyId,
      'room-main',
      [{ memberType: 'agent', memberId: 'dir-explicit' }],
    );
  });

  it('syncActiveAgentsForDepartment includes executors in subtree', async () => {
    const existingDeptRoom = { id: 'room-dept-existing', companyId, roomType: 'department' };
    const room = { id: 'room-dept', companyId, roomType: 'department', organizationNodeId: departmentNode.id };
    const rooms = {
      findMainRoom: jest.fn(),
      findDepartmentRoomByOrganizationNodeId: jest.fn(async () => existingDeptRoom),
      findDepartmentRoomBySlug: jest.fn(),
      createRoom: jest.fn(async () => room),
    };
    const addMembers = jest.fn(async () => []);
    const service = new CollaborationOrgSyncService(
      rooms as any,
      { addMembers } as any,
      {
        find: jest.fn(async () => [
          { id: 'dir-1', organizationNodeId: departmentNode.id, status: 'active' },
          { id: 'exec-1', organizationNodeId: 'agent-slot', status: 'active' },
        ]),
      } as any,
      {
        find: jest.fn(async () => [
          { id: 'ceo-node', parentId: null, type: 'ceo' },
          { id: departmentNode.id, parentId: 'ceo-node', type: 'department' },
          { id: 'agent-slot', parentId: departmentNode.id, type: 'agent' },
        ]),
      } as any,
      { find: jest.fn(async () => []) } as any,
    );

    await service.syncActiveAgentsForDepartment(companyId, departmentNode.id);

    const agentBatch = addMembers.mock.calls.find((c) =>
      c[2]?.some((m: any) => m.memberType === 'agent'),
    );
    const ids = new Set((agentBatch?.[2] ?? []).map((m: any) => m.memberId));
    expect(ids.has('dir-1')).toBe(true);
    expect(ids.has('exec-1')).toBe(true);
  });
});
