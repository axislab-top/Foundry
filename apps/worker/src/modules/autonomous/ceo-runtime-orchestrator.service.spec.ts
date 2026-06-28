import { CeoRuntimeOrchestratorService } from './ceo-runtime-orchestrator.service.js';
import { RuntimeExecutionContext } from '@foundry/multi-agent-core';

describe('CeoRuntimeOrchestratorService', () => {
  it('orchestrateGoal emits delegation trace with messageId when ACP enabled', async () => {
    const messaging = {
      publish: jest.fn().mockResolvedValue(true),
    };
    const config = {
      isAcpProtocolEnabled: () => true,
      isLayeredGraphEnabled: () => false,
    };
    const service = new CeoRuntimeOrchestratorService(messaging as never, config as never);

    const result = await service.orchestrateGoal({
      companyId: 'company-1',
      currentAgentId: 'ceo-1',
      goal: '拆解一个简单目标',
      traceId: 'trace-1',
      delegations: [
        {
          taskId: 'task-1',
          executorAgentId: 'specialist-1',
          inputs: { objective: 'test' },
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.traceEvents.some((event) => event.type === 'orchestrator.delegated')).toBe(true);
    const delegated = result.traceEvents.find((event) => event.type === 'orchestrator.delegated');
    expect(typeof delegated?.messageId).toBe('string');
    expect(RuntimeExecutionContext.current()).toBeUndefined();
    expect(messaging.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'task.delegate',
      }),
      expect.objectContaining({
        routingKey: 'collaboration.agent-message.received',
      }),
    );
  });

  it('orchestrateGoal can run layered graph when feature enabled', async () => {
    const messaging = {
      publish: jest.fn().mockResolvedValue(true),
    };
    const config = {
      isAcpProtocolEnabled: () => true,
      isLayeredGraphEnabled: () => true,
    };
    const service = new CeoRuntimeOrchestratorService(messaging as never, config as never);

    const result = await service.orchestrateGoal({
      companyId: 'company-1',
      currentAgentId: 'ceo-1',
      goal: 'layered goal',
      traceId: 'trace-layered-worker',
    });

    expect(result.success).toBe(true);
    expect(result.traceEvents.some((event) => event.type === 'layered.dispatch')).toBe(true);
  });
});
