import { of } from 'rxjs';
import { OrganizationEvolutionEngine } from './organization-evolution.engine.js';

describe('OrganizationEvolutionEngine', () => {
  it('subscribes events and generates evolution suggestion', async () => {
    const handlers = new Map<string, (evt: any) => Promise<void>>();
    const messaging = {
      subscribeWithBackoff: jest.fn((topic: string, handler: (evt: any) => Promise<void>) => {
        handlers.set(topic, handler);
      }),
      publish: jest.fn(async () => true),
    } as any;
    const governanceBus = {
      publishInterventionReceived: jest.fn(async () => undefined),
      publishCommandExecuted: jest.fn(async () => undefined),
    } as any;
    const config = {
      getWorkerActorUserId: () => 'worker',
      getApiRpcTimeoutMs: () => 1000,
    } as any;
    const apiRpc = {
      send: jest.fn(() => of({ id: 'm1' })),
    } as any;
    const svc = new OrganizationEvolutionEngine(messaging, governanceBus, config, apiRpc);

    svc.onModuleInit();
    const h = handlers.get('department.escalation.forced');
    expect(h).toBeDefined();
    await h?.({
      eventId: 'e1',
      eventType: 'department.escalation.forced',
      aggregateId: 'agg1',
      aggregateType: 'department',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'c1',
      data: {
        companyId: 'c1',
        roomId: 'r1',
        sourceMessageId: 'm1',
        ceoAgentId: 'ceo1',
        departmentSlug: 'engineering',
        reason: 'risk',
        forcedAt: new Date().toISOString(),
        priority: 'high',
      },
    });

    expect(messaging.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'organization.evolution.suggestion.generated',
      }),
      expect.objectContaining({ routingKey: 'organization.evolution.suggestion.generated' }),
    );
    expect(governanceBus.publishInterventionReceived).toHaveBeenCalled();
  });
});

