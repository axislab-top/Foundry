import { MessageProcessingEventFactory } from './message-processing-event.factory.js';

describe('MessageProcessingEventFactory', () => {
  const factory = new MessageProcessingEventFactory();

  it('creates received events with the expected type', () => {
    const event = factory.createReceivedEvent({
      companyId: 'c1',
      messageId: 'm1',
      roomId: 'r1',
      senderType: 'human',
      senderId: 'u1',
      messageType: 'text',
      contentPreview: 'hello',
      createdAt: new Date().toISOString(),
      threadId: null,
    });

    expect(event.eventType).toBe('collaboration.message.received');
    expect(event.data.messageId).toBe('m1');
  });
});
