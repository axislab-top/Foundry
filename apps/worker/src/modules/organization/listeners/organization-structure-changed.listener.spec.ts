import { OrganizationStructureChangedListener } from './organization-structure-changed.listener.js';

describe('OrganizationStructureChangedListener', () => {
  it('should consume event with tenant context', async () => {
    const subscribe = jest.fn();
    const messagingService: any = { subscribe };
    const runWithCompanyId = jest.fn(async (_companyId: string, cb: any) => cb());
    const tenantContext: any = { runWithCompanyId };

    const listener = new OrganizationStructureChangedListener(
      messagingService,
      tenantContext,
    );

    await listener.onModuleInit();
    const handler = subscribe.mock.calls[0][1];
    await handler({
      eventId: 'evt-1',
      eventType: 'organization.structure.changed',
      aggregateId: 'company-1',
      aggregateType: 'organization',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'company-1',
      data: { companyId: 'company-1', reason: 'move' },
    });

    expect(runWithCompanyId).toHaveBeenCalledWith('company-1', expect.any(Function));
  });
});
