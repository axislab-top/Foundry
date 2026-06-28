import { AgentCreatedCollaborationListener } from './agent-created-collaboration.listener.js';

describe('AgentCreatedCollaborationListener', () => {
  it('delegates to CollaborationOrgSyncService on agent.created', async () => {
    const messaging = { subscribeWithBackoff: jest.fn() } as any;
    const tenantContext = {
      runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<void>) => fn()),
    } as any;
    const orgSync = { onAgentCreated: jest.fn(async () => undefined) } as any;

    const listener = new AgentCreatedCollaborationListener(messaging, tenantContext, orgSync);
    const event: any = {
      eventId: 'evt-1',
      data: {
        companyId: 'c-1',
        agentId: 'a-1',
        role: 'executor',
        status: 'active',
        organizationNodeId: 'node-1',
      },
    };

    await (listener as any).handle(event);

    expect(orgSync.onAgentCreated).toHaveBeenCalledWith('c-1', {
      agentId: 'a-1',
      role: 'executor',
      status: 'active',
      organizationNodeId: 'node-1',
    });
  });
});
