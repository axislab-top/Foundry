jest.mock('../../organization/services/organization.service.js', () => ({
  OrganizationService: class MockOrganizationService {},
}));

import { CollaborationBootstrapService } from './collaboration-bootstrap.service.js';

describe('CollaborationBootstrapService', () => {
  it('ensureDepartmentRoomsForCompany syncs managers into existing department rooms', async () => {
    const companyId = 'c-1';
    const deptNode = {
      id: 'node-dept',
      companyId,
      type: 'department' as const,
      name: '销售部',
      order: 0,
      metadata: {},
    };

    const existingRoom = {
      id: 'room-dept-1',
      companyId,
      roomType: 'department' as const,
      organizationNodeId: deptNode.id,
    };

    const orgSync = {
      toDepartmentSlug: jest.fn(() => 'sales'),
      ensureDepartmentRoom: jest.fn(async () => ({ room: existingRoom as any, created: false })),
      syncActiveAgentsForDepartment: jest.fn(async () => undefined),
    };

    const rooms = {
      findDepartmentRoomByOrganizationNodeId: jest.fn(async () => existingRoom as any),
      findDepartmentRoomBySlug: jest.fn(async () => existingRoom as any),
      createRoom: jest.fn(),
      createMainRoom: jest.fn(),
    };

    const addMembers = jest.fn(async () => []);
    const members = {
      addMembers,
      isActiveMember: jest.fn(),
    };

    const organizationService = {
      getRoomOrgSnapshot: jest.fn(async () => undefined),
    };

    const agentsRepo = {
      find: jest.fn(async () => [{ id: 'dir-1' }]),
      findOne: jest.fn(),
    };

    const orgNodesRepo = {
      find: jest.fn(async () => [deptNode]),
    };

    const membershipsRepo = {
      find: jest.fn(async () => [
        { companyId, userId: 'u-owner', role: 'owner', isActive: true },
        { companyId, userId: 'u-admin', role: 'admin', isActive: true },
        { companyId, userId: 'u-mem', role: 'member', isActive: true },
      ]),
    };

    const service = new CollaborationBootstrapService(
      rooms as any,
      members as any,
      orgSync as any,
      organizationService as any,
      agentsRepo as any,
      orgNodesRepo as any,
      membershipsRepo as any,
    );

    await service.ensureDepartmentRoomsForCompany(companyId, 'u-actor');

    expect(orgSync.ensureDepartmentRoom).toHaveBeenCalled();
    expect(orgSync.syncActiveAgentsForDepartment).toHaveBeenCalledWith(companyId, deptNode.id);
    expect(rooms.createRoom).not.toHaveBeenCalled();

    expect(orgSync.ensureDepartmentRoom).toHaveBeenCalledWith(
      companyId,
      deptNode,
      expect.objectContaining({ actorUserId: 'u-actor', syncManagers: true }),
    );
  });

  it('ensureMainRoomForCompany syncs managers after agents join main', async () => {
    const companyId = 'c-2';
    const main = { id: 'room-main', companyId, roomType: 'main' };

    const rooms = {
      createMainRoom: jest.fn(async () => main as any),
      findDepartmentRoomBySlug: jest.fn(),
      createRoom: jest.fn(),
    };

    const addMembers = jest.fn(async () => []);
    const members = { addMembers, isActiveMember: jest.fn() };

    const organizationService = { getRoomOrgSnapshot: jest.fn(async () => undefined) };

    const agentsRepo = {
      findOne: jest.fn(async () => ({ id: 'ceo-1', companyId, role: 'ceo', status: 'active' })),
      find: jest.fn(async () => []),
    };

    const orgNodesRepo = { find: jest.fn() };

    const membershipsRepo = {
      find: jest.fn(async () => [
        { companyId, userId: 'u-owner', role: 'owner', isActive: true },
        { companyId, userId: 'u-admin2', role: 'admin', isActive: true },
      ]),
    };

    const orgSync = {
      toDepartmentSlug: jest.fn(),
      ensureDepartmentRoom: jest.fn(),
      syncActiveAgentsForDepartment: jest.fn(),
    };

    const service = new CollaborationBootstrapService(
      rooms as any,
      members as any,
      orgSync as any,
      organizationService as any,
      agentsRepo as any,
      orgNodesRepo as any,
      membershipsRepo as any,
    );

    await service.ensureMainRoomForCompany(companyId, 'u-owner', 'Acme');

    const mainManagerSync = addMembers.mock.calls.filter(
      (c) => c[0] === companyId && c[1] === main.id && c[2]?.every((m: any) => m.memberType === 'human'),
    );
    expect(mainManagerSync.length).toBeGreaterThanOrEqual(1);
    const lastHumanBatch = mainManagerSync[mainManagerSync.length - 1][2] as { memberId: string }[];
    const ids = new Set(lastHumanBatch.map((x) => x.memberId));
    expect(ids.has('u-owner')).toBe(true);
    expect(ids.has('u-admin2')).toBe(true);
  });
});
