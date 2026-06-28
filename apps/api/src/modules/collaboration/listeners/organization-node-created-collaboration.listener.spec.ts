jest.mock('../../organization/services/organization.service.js', () => ({
  OrganizationService: class MockOrganizationService {},
}));

import { OrganizationNodeCreatedCollaborationListener } from './organization-node-created-collaboration.listener.js';

describe('OrganizationNodeCreatedCollaborationListener', () => {
  it('ensures department room when type is department', async () => {
    const messaging = { subscribeWithBackoff: jest.fn() } as any;
    const tenantContext = {
      runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<void>) => fn()),
    } as any;
    const orgSync = {
      onDepartmentNodeCreated: jest.fn(async () => ({ room: { id: 'room-dept' }, created: true })),
    } as any;
    const organizationService = { getRoomOrgSnapshot: jest.fn(async () => undefined) } as any;
    const orgNodesRepo = {
      findOne: jest.fn(async () => ({
        id: 'dept-1',
        companyId: 'c-1',
        type: 'department',
        name: '研发部',
      })),
    } as any;

    const listener = new OrganizationNodeCreatedCollaborationListener(
      messaging,
      tenantContext,
      orgSync,
      organizationService,
      orgNodesRepo,
    );

    await (listener as any).handle({
      eventId: 'evt-1',
      data: {
        companyId: 'c-1',
        nodeId: 'dept-1',
        type: 'department',
        name: '研发部',
        agentId: 'dir-1',
      },
    });

    expect(orgSync.onDepartmentNodeCreated).toHaveBeenCalledWith(
      'c-1',
      expect.objectContaining({ id: 'dept-1', type: 'department' }),
      { headAgentId: 'dir-1' },
    );
  });

  it('falls back to node.agentId when event omits agentId', async () => {
    const messaging = { subscribeWithBackoff: jest.fn() } as any;
    const tenantContext = {
      runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<void>) => fn()),
    } as any;
    const orgSync = {
      onDepartmentNodeCreated: jest.fn(async () => ({ room: { id: 'room-dept' }, created: true })),
    } as any;
    const organizationService = { getRoomOrgSnapshot: jest.fn(async () => undefined) } as any;
    const orgNodesRepo = {
      findOne: jest.fn(async () => ({
        id: 'dept-1',
        companyId: 'c-1',
        type: 'department',
        name: '研发部',
        agentId: 'dir-from-db',
      })),
    } as any;

    const listener = new OrganizationNodeCreatedCollaborationListener(
      messaging,
      tenantContext,
      orgSync,
      organizationService,
      orgNodesRepo,
    );

    await (listener as any).handle({
      eventId: 'evt-3',
      data: {
        companyId: 'c-1',
        nodeId: 'dept-1',
        type: 'department',
        name: '研发部',
      },
    });

    expect(orgSync.onDepartmentNodeCreated).toHaveBeenCalledWith(
      'c-1',
      expect.objectContaining({ id: 'dept-1', agentId: 'dir-from-db' }),
      { headAgentId: 'dir-from-db' },
    );
  });

  it('skips non-department nodes', async () => {
    const orgSync = { onDepartmentNodeCreated: jest.fn() } as any;
    const listener = new OrganizationNodeCreatedCollaborationListener(
      { subscribeWithBackoff: jest.fn() } as any,
      { runWithCompanyId: jest.fn(async (_c: string, fn: () => Promise<void>) => fn()) } as any,
      orgSync,
      { getRoomOrgSnapshot: jest.fn() } as any,
      { findOne: jest.fn() } as any,
    );

    await (listener as any).handle({
      eventId: 'evt-2',
      data: { companyId: 'c-1', nodeId: 'n-1', type: 'agent', name: '槽位' },
    });

    expect(orgSync.onDepartmentNodeCreated).not.toHaveBeenCalled();
  });
});
