import { of } from 'rxjs';
import { HumanMessage } from '@langchain/core/messages';
import { CollaborationLlmTokenStreamService } from './collaboration-llm-token-stream.service.js';

describe('CollaborationLlmTokenStreamService', () => {
  const baseParams = {
    companyId: 'c1',
    roomId: 'r1',
    agentId: 'a1',
    sourceMessageId: 'm1',
    streamId: 'direct_reply:m1:a1',
    messages: [new HumanMessage('hello')],
  };

  function makeService(overrides?: {
    tokenStreamingEnabled?: boolean;
    flushMs?: number;
    minChars?: number;
  }) {
    const appendCalls: unknown[] = [];
    const config = {
      isCollabLlmTokenStreamingEnabled: () => overrides?.tokenStreamingEnabled ?? true,
      getCollabLlmTokenStreamFlushMs: () => overrides?.flushMs ?? 0,
      getCollabLlmTokenStreamMinChars: () => overrides?.minChars ?? 1,
      getCollaborationLlmTimeoutMs: () => 5000,
      getCollaborationMentionRpcTimeoutMs: () => 5000,
      getWorkerActorUserId: () => 'worker',
    } as any;
    const apiRpc = {
      send: jest.fn((_pattern: string, payload: unknown) => {
        appendCalls.push(payload);
        return of({ id: `chunk-${appendCalls.length}` });
      }),
    } as any;
    const svc = new CollaborationLlmTokenStreamService(config, apiRpc);
    return { svc, appendCalls, apiRpc };
  }

  it('streams token deltas via appendAgent stream_chunk', async () => {
    const { svc, appendCalls } = makeService({ flushMs: 0, minChars: 1 });
    const model = {
      stream: jest.fn(async () =>
        (async function* () {
          yield { content: '你' };
          yield { content: '好' };
          yield { content: '，世界' };
        })(),
      ),
    };

    const result = await svc.streamToRoom({ ...baseParams, model });

    expect(result.tokenStreamed).toBe(true);
    expect(result.text).toBe('你好，世界');
    expect(appendCalls.length).toBeGreaterThanOrEqual(1);
    expect(appendCalls[0]).toEqual(
      expect.objectContaining({
        messageType: 'stream_chunk',
        metadata: expect.objectContaining({
          streamId: 'direct_reply:m1:a1',
          tokenStream: true,
          provisional: true,
        }),
      }),
    );
  });

  it('falls back to invoke when token streaming disabled', async () => {
    const { svc, appendCalls } = makeService({ tokenStreamingEnabled: false });
    const model = {
      stream: jest.fn(async () =>
        (async function* () {
          yield { content: 'ignored' };
        })(),
      ),
      invoke: jest.fn(async () => ({ content: '完整回复' })),
    };

    const result = await svc.streamToRoom({ ...baseParams, model });

    expect(result.tokenStreamed).toBe(false);
    expect(result.text).toBe('完整回复');
    expect(model.invoke).toHaveBeenCalled();
    expect(appendCalls).toHaveLength(0);
  });

  it('falls back to invoke when model.stream is missing', async () => {
    const { svc, appendCalls } = makeService();
    const model = {
      invoke: jest.fn(async () => ({ content: '无 stream 方法' })),
    };

    const result = await svc.streamToRoom({ ...baseParams, model });

    expect(result.tokenStreamed).toBe(false);
    expect(result.text).toBe('无 stream 方法');
    expect(appendCalls).toHaveLength(0);
  });
});
