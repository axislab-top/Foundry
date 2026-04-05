import { of } from 'rxjs';
import { PendingAgentTaskExecutionService } from './pending-agent-tasks.service.js';

describe('PendingAgentTaskExecutionService', () => {
  it('should NOT auto-execute review task requiring human approval', async () => {
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'tasks.findAll') {
          return of({
            items: [
              {
                id: 'task-1',
                title: 'Needs approval',
                status: 'review',
                requiresHumanApproval: true,
                assigneeType: 'agent',
                assigneeId: 'agent-1',
                metadata: {
                  roomId: 'room-1',
                  ceoApprovalDecision: 'pending',
                },
              },
            ],
          });
        }
        return of({});
      }),
    } as any;

    const config = {
      getWorkerActorUserId: () => 'worker-admin',
      getApiRpcTimeoutMs: () => 5000,
    } as any;

    const registry = {
      setAgentTools: jest.fn(),
    } as any;

    const agentExecution = {
      executeSkill: jest.fn(),
    } as any;

    const gate = {
      isCeoApproved: jest.fn(() => false),
    } as any;

    const service = new PendingAgentTaskExecutionService(
      apiRpc,
      config,
      registry,
      agentExecution,
      gate,
    );

    await service.processPendingForCompany('company-1');

    // review + requiresHumanApproval should wait user action, never execute skill
    expect(agentExecution.executeSkill).not.toHaveBeenCalled();
    expect(apiRpc.send).not.toHaveBeenCalledWith(
      'tasks.update',
      expect.objectContaining({
        id: 'task-1',
        data: expect.objectContaining({ status: 'in_progress' }),
      }),
    );
  });
});

