import { GovernanceCommandBusService } from './governance-command-bus.service.js';

describe('GovernanceCommandBusService', () => {
  it('publishes governance intervention and command events', async () => {
    const messaging = {
      publish: jest.fn(async () => true),
    } as any;
    const bus = new GovernanceCommandBusService(messaging);

    await bus.publishInterventionReceived({
      companyId: 'c1',
      interventionType: 'forced_arbitration',
      source: 'ceo',
      payload: { reason: 'risk' },
      commandVersion: 2,
    });
    await bus.publishCommandExecuted({
      companyId: 'c1',
      commandType: 'ceo_forced_arbitration',
      commandVersion: 2,
      status: 'applied',
      payload: { decision: 'approve' },
    });

    expect(messaging.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'governance.intervention.received' }),
      expect.objectContaining({ routingKey: 'governance.intervention.received', persistent: true }),
    );
    expect(messaging.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'governance.command.executed' }),
      expect.objectContaining({ routingKey: 'governance.command.executed', persistent: true }),
    );
  });
});

