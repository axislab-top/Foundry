import { MainRoomReplaySsotPublisherService } from './main-room-replay-ssot-publisher.service.js';

describe('MainRoomReplaySsotPublisherService', () => {
  it('does not publish when phase2 flag is disabled', async () => {
    const messaging = { publish: jest.fn(async () => undefined) };
    const config = { isCollabMainRoomReplaySsotPhase2Enabled: () => false };
    const svc = new MainRoomReplaySsotPublisherService(messaging as never, config as never);

    await svc.publishDelegateCompleted({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm1',
      traceId: 't1',
      authorizationOutcome: 'propose',
      discussionMode: false,
    });

    expect(messaging.publish).not.toHaveBeenCalled();
  });

  it('publishes collaboration.replay.delegate.completed when enabled', async () => {
    const messaging = { publish: jest.fn(async () => undefined) };
    const config = { isCollabMainRoomReplaySsotPhase2Enabled: () => true };
    const svc = new MainRoomReplaySsotPublisherService(messaging as never, config as never);

    await svc.publishDelegateCompleted({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm1',
      traceId: 't1',
      authorizationOutcome: 'authorized',
      discussionMode: false,
    });

    expect(messaging.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'collaboration.replay.delegate.completed',
        companyId: 'c1',
        data: expect.objectContaining({
          messageId: 'm1',
          replayDecisionKind: 'confirm_execution',
        }),
      }),
      expect.objectContaining({ routingKey: 'collaboration.replay.delegate.completed' }),
    );
  });
});
