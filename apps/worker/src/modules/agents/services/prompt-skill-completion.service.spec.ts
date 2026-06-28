import { PromptSkillCompletionService } from './prompt-skill-completion.service.js';
import { ToolRegistry } from '@service/ai';
import type { SkillToolSnapshot } from '@contracts/events';

function baseSnap(): SkillToolSnapshot {
  return {
    id: 'sk-1',
    name: 'report-skill',
    description: 'Catalog',
    toolSchema: { type: 'object', properties: {} },
    promptTemplate: '# Report\n\nSummarize the task.',
    implementationType: 'prompt',
    handlerConfig: null,
    requiredPermissions: [],
    version: 1,
    isPublic: true,
    isSystem: false,
  };
}

describe('PromptSkillCompletionService', () => {
  it('invokes LLM with instructions and returns text content', async () => {
    const invoke = jest.fn().mockResolvedValue({
      content: 'Task completed: shipped v1.',
    });
    const llmBridge = {
      createChatModelResolved: jest.fn().mockResolvedValue({
        model: { bind: undefined, invoke },
        modelName: 'test',
      }),
    };
    const agentExecution = {
      executeSkill: jest.fn(),
    };
    const config = {
      getCollabDirectReplyModel: () => 'gpt-4o-mini',
      getApiRpcTimeoutMs: () => 30_000,
      isSkillProgressiveDisclosureEnabled: () => true,
    };
    const registry = new ToolRegistry();
    const moduleRef = { get: jest.fn(() => agentExecution) } as any;
    const svc = new PromptSkillCompletionService(
      llmBridge as any,
      registry,
      moduleRef,
      config as any,
    );

    const result = await svc.complete({
      exec: {
        companyId: 'c1',
        agentId: 'a1',
        skillName: 'report-skill',
        args: { taskId: 't1' },
      },
      snap: baseSnap(),
    });

    expect(result).toBe('Task completed: shipped v1.');
    expect(invoke).toHaveBeenCalled();
    const messages = invoke.mock.calls[0][0];
    expect(messages[0].content).toContain('Summarize the task');
    expect(agentExecution.executeSkill).not.toHaveBeenCalled();
  });

  it('runs bound tool calls in mini loop', async () => {
    const invoke = jest
      .fn()
      .mockResolvedValueOnce({
        tool_calls: [
          {
            id: 'tc1',
            name: 'tool.echo',
            args: { message: 'hi' },
          },
        ],
      })
      .mockResolvedValueOnce({ content: 'Done after tool.' });

    const llmBridge = {
      createChatModelResolved: jest.fn().mockResolvedValue({
        model: {
          bind: jest.fn().mockReturnValue({ invoke }),
        },
      }),
    };
    const agentExecution = {
      executeSkill: jest.fn().mockResolvedValue({ result: { ok: true }, durationMs: 1 }),
    };
    const config = {
      getCollabDirectReplyModel: () => 'gpt-4o-mini',
      getApiRpcTimeoutMs: () => 30_000,
      isSkillProgressiveDisclosureEnabled: () => true,
    };
    const registry = new ToolRegistry();
    const snap = baseSnap();
    snap.boundTools = [
      { name: 'tool.echo', description: 'Echo', inputSchema: { type: 'object', properties: {} } },
    ];

    const moduleRef = { get: jest.fn(() => agentExecution) } as any;
    const svc = new PromptSkillCompletionService(
      llmBridge as any,
      registry,
      moduleRef,
      config as any,
    );

    const result = await svc.complete({
      exec: {
        companyId: 'c1',
        agentId: 'a1',
        skillName: 'report-skill',
        args: {},
      },
      snap,
    });

    expect(result).toBe('Done after tool.');
    expect(agentExecution.executeSkill).toHaveBeenCalledWith(
      expect.objectContaining({ skillName: 'tool.echo' }),
    );
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('exposes companion skills bound on the agent during prompt completion', async () => {
    const invoke = jest.fn().mockResolvedValue({ content: 'Done.' });
    const bind = jest.fn().mockReturnValue({ invoke });
    const llmBridge = {
      createChatModelResolved: jest.fn().mockResolvedValue({ model: { bind } }),
    };
    const agentExecution = { executeSkill: jest.fn() };
    const config = {
      getCollabDirectReplyModel: () => 'gpt-4o-mini',
      getApiRpcTimeoutMs: () => 30_000,
      isSkillProgressiveDisclosureEnabled: () => true,
    };
    const registry = new ToolRegistry();
    registry.setAgentTools('c1', 'a1', [
      {
        ...baseSnap(),
        name: 'checklist-skill',
        handlerConfig: { companionSkillNames: ['file-read'] },
      },
      {
        ...baseSnap(),
        id: 'sk-2',
        name: 'file-read',
        description: 'Read files',
      },
    ]);
    const snap = {
      ...baseSnap(),
      name: 'checklist-skill',
      handlerConfig: { companionSkillNames: ['file-read'] },
    };
    const moduleRef = { get: jest.fn(() => agentExecution) } as any;
    const svc = new PromptSkillCompletionService(
      llmBridge as any,
      registry,
      moduleRef,
      config as any,
    );

    await svc.complete({
      exec: { companyId: 'c1', agentId: 'a1', skillName: 'checklist-skill', args: {} },
      snap,
    });

    const toolsArg = bind.mock.calls[0][0].tools as Array<{ function: { name: string } }>;
    expect(toolsArg.some((t) => t.function.name === 'file-read')).toBe(true);
  });
});
