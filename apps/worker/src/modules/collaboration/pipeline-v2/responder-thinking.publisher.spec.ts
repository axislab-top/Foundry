import { ResponderThinkingPublisher } from './responder-thinking.publisher.js';

describe('ResponderThinkingPublisher', () => {
  it('retries publishResponderThinking before logging failure', async () => {
    const config = {
      isCollabResponderThinkingEnabled: () => true,
      getCollabResponderThinkingRetryAttempts: () => 2,
      getCollaborationMentionRpcTimeoutMs: () => 5000,
    } as any;
    const apiRpc = {
      send: jest.fn(),
    } as any;
    const { of, throwError } = await import('rxjs');
    apiRpc.send
      .mockReturnValueOnce(throwError(() => new Error('rpc fail 1')))
      .mockReturnValue(of({ ok: true }));

    const publisher = new ResponderThinkingPublisher(config, apiRpc);
    publisher.publishBestEffort({
      companyId: 'co1',
      roomId: 'room-main',
      sourceMessageId: 'msg-1',
      status: 'thinking',
      responderAgentIds: ['ceo-1'],
    });

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(apiRpc.send).toHaveBeenCalledTimes(2);
    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.realtime.publishResponderThinking',
      expect.objectContaining({
        companyId: 'co1',
        roomId: 'room-main',
        sourceMessageId: 'msg-1',
        status: 'thinking',
      }),
    );
  });
});
