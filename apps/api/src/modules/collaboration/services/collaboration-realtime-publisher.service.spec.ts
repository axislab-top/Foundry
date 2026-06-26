jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

import { createClient } from 'redis';
import {
  COLLAB_NOTIFY_CHANNEL,
  CollaborationRealtimePublisher,
} from './collaboration-realtime-publisher.service.js';
import type { ChatMessage } from '../entities/chat-message.entity.js';

describe('CollaborationRealtimePublisher', () => {
  const message = {
    id: 'm-1',
    companyId: 'company-1',
    roomId: 'room-1',
    seq: 1,
    senderType: 'human',
    senderId: 'user-1',
    messageType: 'text',
    content: 'hello',
    metadata: { ceoAlignment: { phase: 'aligning' } },
    createdAt: new Date('2026-06-10T00:00:00.000Z'),
  } as ChatMessage;

  function makePublisher(notifyEnabled: boolean) {
    const config = {
      isCollaborationRedisNotifyEnabled: () => notifyEnabled,
      getCollabRedisUrl: () => undefined,
      getRedisConfig: () => ({ host: 'localhost', port: 6379, db: 0 }),
    };
    return new CollaborationRealtimePublisher(config as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishMessageMetadataUpdated publishes message:metadata_updated payload', async () => {
    const publish = jest.fn(async () => 1);
    (createClient as jest.Mock).mockReturnValue({
      isOpen: true,
      connect: jest.fn(async () => undefined),
      publish,
      quit: jest.fn(async () => undefined),
    });

    await makePublisher(true).publishMessageMetadataUpdated('company-1', message);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(COLLAB_NOTIFY_CHANNEL, expect.any(String));
    const payload = JSON.parse(String(publish.mock.calls[0][1]));
    expect(payload).toEqual(
      expect.objectContaining({
        v: 1,
        companyId: 'company-1',
        roomId: 'room-1',
        event: 'message:metadata_updated',
        message: expect.objectContaining({
          id: 'm-1',
          metadata: { ceoAlignment: { phase: 'aligning' } },
        }),
      }),
    );
  });

  it('no-ops when redis notify is disabled', async () => {
    const publish = jest.fn();
    (createClient as jest.Mock).mockReturnValue({ publish, connect: jest.fn() });

    await makePublisher(false).publishMessageMetadataUpdated('company-1', message);

    expect(createClient).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('swallows redis publish errors without throwing', async () => {
    (createClient as jest.Mock).mockReturnValue({
      isOpen: true,
      connect: jest.fn(async () => undefined),
      publish: jest.fn(async () => {
        throw new Error('redis unavailable');
      }),
      quit: jest.fn(async () => undefined),
    });

    await expect(
      makePublisher(true).publishMessageMetadataUpdated('company-1', message),
    ).resolves.toBeUndefined();
  });
});
