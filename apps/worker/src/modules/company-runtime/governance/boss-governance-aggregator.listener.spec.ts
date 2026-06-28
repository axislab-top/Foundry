import { BossGovernanceAggregatorListener } from './boss-governance-aggregator.listener.js';

describe('BossGovernanceAggregatorListener', () => {
  it('aggregates timeline and routes boss intervention request', async () => {
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
    const svc = new BossGovernanceAggregatorListener(messaging, governanceBus);
    svc.onModuleInit();

    const governanceHandler = handlers.get('governance.command.executed');
    await governanceHandler?.({
      eventId: 'e1',
      eventType: 'governance.command.executed',
      aggregateId: 'c1:cmd',
      aggregateType: 'governance_command',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'c1',
      data: {
        companyId: 'c1',
        commandId: 'cmd1',
        commandType: 'ceo_forced_arbitration',
        commandVersion: 1,
        status: 'applied',
        executedAt: new Date().toISOString(),
      },
    });
    expect(messaging.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'governance.timeline.updated' }),
      expect.objectContaining({ routingKey: 'governance.timeline.updated' }),
    );

    const reqHandler = handlers.get('governance.intervention.request');
    await reqHandler?.({
      eventId: 'e2',
      eventType: 'governance.intervention.request',
      aggregateId: 'c1:req',
      aggregateType: 'governance_request',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'c1',
      data: {
        companyId: 'c1',
        requestId: 'req1',
        requestedBy: 'boss1',
        interventionType: 'strategy_adjustment',
        payload: { target: 'engineering' },
        requestedAt: new Date().toISOString(),
        commandVersion: 1,
      },
    });
    expect(governanceBus.publishInterventionReceived).toHaveBeenCalled();
    expect(governanceBus.publishCommandExecuted).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: 'boss_intervention.strategy_adjustment',
        status: 'accepted',
      }),
    );
  });
});

