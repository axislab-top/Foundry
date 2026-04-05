import { CompanyCreatedListener } from './company-created.listener.js';

describe('CompanyCreatedListener idempotency', () => {
  it('should skip duplicated company.created event', async () => {
    const subscribe = jest.fn();
    const messagingService: any = { subscribe };
    const idempotency: any = {
      markIfNew: jest
        .fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false),
    };
    const runWithCompanyId = jest.fn(async (_companyId: string, cb: any) => cb());
    const tenantContext: any = { runWithCompanyId };

    const listener = new CompanyCreatedListener(
      messagingService,
      idempotency,
      tenantContext,
    );
    await listener.onModuleInit();
    const handler = subscribe.mock.calls[0][1];

    const event = {
      eventId: 'evt-dup-1',
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
        createdBy: 'user-1',
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    };

    await handler(event);
    await handler(event);

    expect(idempotency.markIfNew).toHaveBeenCalledTimes(2);
    expect(runWithCompanyId).toHaveBeenCalledTimes(2);
  });
});
