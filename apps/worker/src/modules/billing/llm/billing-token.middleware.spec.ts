import { HumanMessage } from '@langchain/core/messages';
import { BillingTokenMiddleware } from './billing-token.middleware.js';
import { runWithLlmBillingContext } from './billing-token.context.js';

describe('BillingTokenMiddleware', () => {
  it('wrapChatModel invoke publishes one billing event when ALS context set', async () => {
    const published: unknown[] = [];
    const messaging = {
      publish: jest.fn(async (ev: unknown) => {
        published.push(ev);
        return true;
      }),
    };
    const mw = new BillingTokenMiddleware(messaging as never);

    const model = {
      invoke: jest.fn(async (_input: unknown) => ({
        content: 'ok',
        response_metadata: { usage: { prompt_tokens: 5, completion_tokens: 7 } },
      })),
    };

    const wrapped = mw.wrapChatModel(model as never, { modelName: 'm1', llmKeyId: 'key-1' }) as {
      invoke: (msg: unknown[]) => Promise<unknown>;
    };

    await runWithLlmBillingContext(
      {
        companyId: 'c1',
        agentId: 'a1',
        departmentId: 'd1',
        taskId: 't1',
        traceId: 'tr1',
        messageId: 'mid-1',
        pricingSnapshotJson: { inputPricePerMillion: '1', outputPricePerMillion: '2', currency: 'USD' },
        pricingSource: 'snapshot',
      },
      async () => {
        await wrapped.invoke([new HumanMessage('hello')]);
      },
    );

    expect(messaging.publish).toHaveBeenCalledTimes(1);
    const ev = published[0] as { data: Record<string, unknown> };
    expect(ev.data.recordType).toBe('llm');
    expect(ev.data.agentId).toBe('a1');
    expect(ev.data.inputTokens).toBe(5);
    expect(ev.data.outputTokens).toBe(7);
    expect(ev.data.pricingSnapshotJson).toMatchObject({ inputPricePerMillion: '1' });
    expect(ev.data.idempotencyKey).toBe('llm:c1:a1:msg:mid-1:invoke:1');
  });

  it('wrapChatModel invoke skips publish without billing context', async () => {
    const messaging = { publish: jest.fn(async () => true) };
    const mw = new BillingTokenMiddleware(messaging as never);
    const model = {
      invoke: jest.fn(async (_input: unknown) => ({ content: 'x' })),
    };
    const wrapped = mw.wrapChatModel(model as never, { modelName: 'm', llmKeyId: 'k' }) as {
      invoke: (msg: unknown[]) => Promise<unknown>;
    };
    await wrapped.invoke([new HumanMessage('h')]);
    expect(messaging.publish).not.toHaveBeenCalled();
  });

  it('wrapChatModel stream publishes once after iterator completes', async () => {
    const messaging = { publish: jest.fn(async () => true) };
    const mw = new BillingTokenMiddleware(messaging as never);

    async function* fakeStream(_input: unknown) {
      yield { content: 'a' };
      yield { content: 'b' };
    }

    const model = {
      invoke: jest.fn(async (_input: unknown) => ({})),
      stream: fakeStream,
    };

    const wrapped = mw.wrapChatModel(model as never, { modelName: 'm', llmKeyId: 'k', callsite: 'stream_test' }) as {
      stream: (msg: unknown[]) => unknown;
    };

    await runWithLlmBillingContext(
      { companyId: 'c', agentId: 'a', callId: 'call-1' },
      async () => {
        const raw = (wrapped as { stream: (m: unknown[]) => unknown }).stream([new HumanMessage('h')]);
        const iter =
          raw != null && typeof (raw as Promise<AsyncIterable<unknown>>).then === 'function'
            ? await (raw as Promise<AsyncIterable<unknown>>)
            : (raw as AsyncIterable<unknown>);
        for await (const _ of iter) {
          /* drain */
        }
      },
    );

    expect(messaging.publish).toHaveBeenCalledTimes(1);
  });
});
