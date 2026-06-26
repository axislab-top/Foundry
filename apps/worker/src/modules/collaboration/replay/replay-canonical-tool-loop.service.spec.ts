import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ReplayCanonicalToolLoopService } from './replay-canonical-tool-loop.service.js';

describe('ReplayCanonicalToolLoopService', () => {
  it('executes tool calls and appends ToolMessages; stops when model returns no tool_calls', async () => {
    const executeTools = jest.fn().mockResolvedValue([{ ok: true, toolName: 'memory.search', data: { hits: [] } }]);
    const ceoTools = { executeTools } as never;
    const svc = new ReplayCanonicalToolLoopService(ceoTools, {} as any);

    let invokeCount = 0;
    const modelWithTools = {
      invoke: jest.fn(async (msgs: unknown[]) => {
        invokeCount += 1;
        if (invokeCount === 1) {
          return {
            tool_calls: [{ id: 'c1', name: 'memory.search', args: { query: 'q' } }],
            content: '',
          };
        }
        return { content: 'done' };
      }),
    };

    const messages = [new SystemMessage('t'), new HumanMessage('h')];
    const out = await svc.run({
      modelWithTools,
      messages,
      companyId: 'c1',
      roomId: 'r1',
      threadId: null,
      traceId: 'tr',
      messageId: 'm1',
      ceoAgentId: 'ceo-1',
      humanSenderId: null,
      maxRounds: 3,
      maxCallsPerRound: 5,
    });

    expect(executeTools).toHaveBeenCalledTimes(1);
    expect(out.telemetry.toolCallsExecuted).toBe(1);
    expect(out.telemetry.toolNames).toEqual(['memory.search']);
    expect(out.messages.length).toBeGreaterThan(2);
  });

  it('rejects non-allowlisted tool names with error ToolMessage', async () => {
    const executeTools = jest.fn();
    const svc = new ReplayCanonicalToolLoopService({ executeTools } as never, {} as any);

    const modelWithTools = {
      invoke: jest.fn(async () => ({
        tool_calls: [{ id: 'x1', name: 'unknown.tool', args: {} }],
        content: '',
      })),
    };

    const out = await svc.run({
      modelWithTools,
      messages: [new SystemMessage('s'), new HumanMessage('h')],
      companyId: 'c1',
      roomId: 'r1',
      threadId: null,
      traceId: 'tr',
      messageId: 'm1',
      ceoAgentId: 'ceo-1',
      humanSenderId: null,
      maxRounds: 2,
      maxCallsPerRound: 5,
    });

    expect(executeTools).not.toHaveBeenCalled();
    const last = out.messages[out.messages.length - 1] as { content?: string };
    expect(String(last.content ?? '')).toContain('TOOL_NOT_ALLOWED_IN_REPLAY');
  });
});
