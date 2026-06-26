import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AgentDirectSkillToolLoopService } from './agent-direct-skill-tool-loop.service.js';

describe('AgentDirectSkillToolLoopService', () => {
  it('executes executeSkill when model returns allowed tool_call', async () => {
    const executeSkill = jest.fn().mockResolvedValue({ result: { ok: true }, durationMs: 5 });
    const svc = new AgentDirectSkillToolLoopService({ executeSkill } as any);

    const modelWithTools = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce({
          content: '',
          tool_calls: [{ id: 'tc1', name: 'echo', args: { message: 'hi' } }],
        })
        .mockResolvedValueOnce({ content: 'Done from model.' }),
    };

    const out = await svc.run({
      modelWithTools,
      messages: [new SystemMessage('sys'), new HumanMessage('user')],
      companyId: 'c1',
      agentId: 'a1',
      traceId: 'tr1',
      maxRounds: 3,
      maxCallsPerRound: 4,
      allowedToolNames: new Set(['echo']),
      capabilitySkillIds: ['sk-1'],
    });

    expect(executeSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'c1',
        agentId: 'a1',
        skillName: 'echo',
        layer: 'direct',
        capabilitySkillIds: ['sk-1'],
        promptSkillMode: 'auto',
      }),
    );
    expect(out.telemetry.toolCallsExecuted).toBe(1);
    expect(out.text).toContain('Done');
    expect(executeSkill).toHaveBeenCalledWith(expect.objectContaining({ promptSkillMode: 'auto' }));
  });

  it('passes promptSkillMode complete when configured', async () => {
    const executeSkill = jest.fn().mockResolvedValue({ result: 'done', durationMs: 1 });
    const svc = new AgentDirectSkillToolLoopService({ executeSkill } as any);
    const modelWithTools = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce({
          content: '',
          tool_calls: [{ id: 'tc1', name: 'echo', args: {} }],
        })
        .mockResolvedValueOnce({ content: 'OK' }),
    };
    await svc.run({
      modelWithTools,
      messages: [new SystemMessage('sys'), new HumanMessage('user')],
      companyId: 'c1',
      agentId: 'a1',
      traceId: 'tr1',
      maxRounds: 2,
      maxCallsPerRound: 2,
      allowedToolNames: new Set(['echo']),
      promptSkillMode: 'complete',
    });
    expect(executeSkill).toHaveBeenCalledWith(expect.objectContaining({ promptSkillMode: 'complete' }));
  });

  it('rejects tool not in allowedToolNames without executeSkill', async () => {
    const executeSkill = jest.fn();
    const svc = new AgentDirectSkillToolLoopService({ executeSkill } as any);

    const modelWithTools = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce({
          content: '',
          tool_calls: [{ id: 'tc1', name: 'forbidden-skill', args: {} }],
        })
        .mockResolvedValueOnce({ content: 'Fallback answer.' }),
    };

    const out = await svc.run({
      modelWithTools,
      messages: [new SystemMessage('sys'), new HumanMessage('user')],
      companyId: 'c1',
      agentId: 'a1',
      traceId: 'tr1',
      maxRounds: 2,
      maxCallsPerRound: 2,
      allowedToolNames: new Set(['echo']),
    });

    expect(executeSkill).not.toHaveBeenCalled();
    expect(out.text).toContain('Fallback');
  });
});
