import { UserCreatedListener } from './user-created.listener.js';

describe('UserCreatedListener tenant context', () => {
  it('should run handler inside tenant context when event has companyId', async () => {
    const subscribe = jest.fn();
    const messagingService: any = { subscribe };
    const idempotency: any = { markIfNew: jest.fn().mockReturnValue(true) };
    const runWithCompanyId = jest.fn(async (_companyId: string, cb: any) => cb());
    const tenantContext: any = { runWithCompanyId };

    const listener = new UserCreatedListener(
      messagingService,
      idempotency,
      tenantContext,
    );

    await listener.onModuleInit();
    const handler = subscribe.mock.calls[0][1];
    await handler(
      {
        eventId: 'evt-1',
        eventType: 'user.created',
        aggregateId: 'u-1',
        aggregateType: 'user',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: 'company-worker',
        data: {
          userId: 'u-1',
          username: 'u',
          email: 'u@test.com',
          roles: [],
          permissions: [],
          createdAt: new Date().toISOString(),
        },
      },
      {},
    );

    expect(runWithCompanyId).toHaveBeenCalledWith(
      'company-worker',
      expect.any(Function),
    );
  });
});
