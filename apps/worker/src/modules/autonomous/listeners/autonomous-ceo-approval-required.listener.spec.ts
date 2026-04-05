import { AutonomousCeoApprovalRequiredListener } from './autonomous-ceo-approval-required.listener.js';

describe('AutonomousCeoApprovalRequiredListener', () => {
  it('onModuleInit should subscribe with exclusive queue options', async () => {
    const messaging = {
      subscribeWithBackoff: jest.fn(),
      publish: jest.fn(),
    } as any;

    const gate = {
      markRequired: jest.fn(),
    } as any;

    const listener = new AutonomousCeoApprovalRequiredListener(messaging, gate);
    await listener.onModuleInit();

    expect(messaging.subscribeWithBackoff).toHaveBeenCalledTimes(1);
    const [eventType, _handler, options] = messaging.subscribeWithBackoff.mock.calls[0] as [
      string,
      Function,
      any,
    ];
    expect(eventType).toBe('autonomous.ceo.approval.required');
    expect(options).toEqual(
      expect.objectContaining({
        exclusive: true,
        autoDelete: true,
        durable: false,
        prefetchCount: 10,
      }),
    );
  });
});

