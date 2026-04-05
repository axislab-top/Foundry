import { CompanyCreatedListener } from './company-created.listener.js';

describe('CompanyCreatedListener organization initialization', () => {
  it('should invoke organization initialization branch once', async () => {
    const subscribe = jest.fn();
    const messagingService: any = { subscribe };
    const idempotency: any = { markIfNew: jest.fn().mockReturnValue(true) };
    const runWithCompanyId = jest.fn(async (_companyId: string, cb: any) => cb());
    const tenantContext: any = { runWithCompanyId };

    const listener = new CompanyCreatedListener(
      messagingService,
      idempotency,
      tenantContext,
    );

    const initOrgSpy = jest.spyOn(listener as any, 'initializeDefaultOrganization');
    await listener.onModuleInit();

    const handler = subscribe.mock.calls[0][1];
    await handler({
      eventId: 'evt-1',
      eventType: 'company.created',
      aggregateId: 'company-1',
      aggregateType: 'company',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'company-1',
      data: {
        companyId: 'company-1',
        name: 'Acme',
        slug: 'acme',
        industry: 'tech',
        createdBy: 'user-1',
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    });

    expect(initOrgSpy).toHaveBeenCalledTimes(1);
  });
});
