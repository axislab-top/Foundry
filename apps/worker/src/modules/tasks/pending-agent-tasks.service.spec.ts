import { of, throwError } from 'rxjs';
import { PendingAgentTaskExecutionService } from './pending-agent-tasks.service.js';

function defaultDeliverableDeps() {
  return {
    unifiedDeliverable: {
      hydrateAgentSkills: jest.fn().mockResolvedValue([
        {
          id: 'sk1',
          name: 'echo',
          toolSchema: { type: 'object', properties: {} },
          requiredPermissions: [],
        },
      ]),
      pickSkillName: jest.fn().mockImplementation((_skills: any, opts: any) => opts?.preferredSkillName ?? 'echo'),
      resolveExecutionRoles: jest.fn().mockResolvedValue(['read:organization']),
    },
    deliverableGate: { evaluate: jest.fn().mockReturnValue({ allowed: true }) },
  };
}

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
      getPendingAgentTasksMaxPerTick: () => 20,
    } as any;

    const registry = {
      setAgentTools: jest.fn(),
    } as any;

    const agentExecution = {
      executeSkill: jest.fn(),
    } as any;

    const executionLog = { appendForTask: jest.fn() } as any;
    const monitoring = {
      incTaskExecutionResumedAfterApproval: jest.fn(),
      incTaskExecutionBlockedByApproval: jest.fn(),
    } as any;

    const messaging = { publish: jest.fn().mockResolvedValue(undefined) } as any;
    const l1Flags = { isEmployeeAutonomousEnabledForCompany: jest.fn().mockResolvedValue(false) } as any;
    const fileAssetsRegistration = {
      registerFromArtifacts: jest.fn().mockResolvedValue([]),
    } as any;
    const { unifiedDeliverable, deliverableGate } = defaultDeliverableDeps();

    const service = new PendingAgentTaskExecutionService(
      apiRpc,
      config,
      registry,
      agentExecution,
      executionLog,
      monitoring,
      messaging,
      l1Flags,
      fileAssetsRegistration,
      unifiedDeliverable as any,
      deliverableGate as any,
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

  it('P12: code-run mints approval.createExecutionToken and passes executionTokenId to executeSkill', async () => {
    const apiRpc = {
      send: jest.fn((pattern: string, payload: Record<string, unknown>) => {
        if (pattern === 'tasks.findAll') {
          const st = payload?.status as string | undefined;
          if (st !== 'in_progress') {
            return of({ items: [] });
          }
          return of({
            items: [
              {
                id: 'task-cr',
                title: 'shell',
                status: 'in_progress',
                requiresHumanApproval: false,
                assigneeType: 'agent',
                assigneeId: 'agent-1',
                metadata: {
                  skillName: 'code-run',
                  command: 'git status',
                  approvalRequestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                },
              },
            ],
          });
        }
        if (pattern === 'agents.effectiveSkillSnapshots') {
          return of({
            skills: [
              {
                id: 'sk1',
                name: 'code-run',
                description: null,
                toolSchema: { type: 'object', properties: {} },
                promptTemplate: null,
                implementationType: 'builtin',
                handlerConfig: null,
                requiredPermissions: [],
                version: 1,
                isPublic: true,
                isSystem: false,
              },
            ],
          });
        }
        if (pattern === 'billing.checkAllowance') {
          return of({ allowed: true });
        }
        if (pattern === 'approval.createExecutionToken') {
          expect(payload).toMatchObject({
            approvalRequestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            skillSlug: 'code-run',
          });
          return of({
            executionTokenId: '00000000-0000-4000-8000-0000000000aa',
            approvalRequestId: 'apr-1',
          });
        }
        if (pattern === 'tasks.update') {
          return of({});
        }
        if (pattern === 'tasks.executionLog.append') {
          return of({});
        }
        return of({});
      }),
    } as any;

    const config = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
      getApiRpcTimeoutMs: () => 5000,
      getBudgetApprovalThreshold: () => 0,
      getAgentSkillBudgetEstimate: () => 0.01,
      getCeoRequireExecutionToken: () => true,
      getPendingAgentTasksMaxPerTick: () => 20,
    } as any;

    const registry = { setAgentTools: jest.fn() } as any;
    const agentExecution = {
      executeSkill: jest.fn().mockResolvedValue({ result: { ok: true }, durationMs: 1 }),
    } as any;
    const executionLog = { appendForTask: jest.fn() } as any;
    const monitoring = {
      incTaskExecutionResumedAfterApproval: jest.fn(),
      incTaskExecutionBlockedByApproval: jest.fn(),
    } as any;

    const messaging = { publish: jest.fn().mockResolvedValue(undefined) } as any;
    const l1Flags = { isEmployeeAutonomousEnabledForCompany: jest.fn().mockResolvedValue(false) } as any;
    const fileAssetsRegistration = {
      registerFromArtifacts: jest.fn().mockResolvedValue([]),
    } as any;
    const { unifiedDeliverable, deliverableGate } = defaultDeliverableDeps();

    const service = new PendingAgentTaskExecutionService(
      apiRpc,
      config,
      registry,
      agentExecution,
      executionLog,
      monitoring,
      messaging,
      l1Flags,
      fileAssetsRegistration,
      unifiedDeliverable as any,
      deliverableGate as any,
    );

    await service.processPendingForCompany('company-1');

    expect(apiRpc.send).toHaveBeenCalledWith(
      'approval.createExecutionToken',
      expect.objectContaining({
        companyId: 'company-1',
        skillSlug: 'code-run',
        approvalRequestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        context: expect.objectContaining({ taskId: 'task-cr' }),
      }),
    );
    expect(agentExecution.executeSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: 'code-run',
        executionTokenId: '00000000-0000-4000-8000-0000000000aa',
        skillExecutionId: expect.any(String),
      }),
    );
  });

  it('P12: code-run skips executeSkill when token mint fails and require flag is true', async () => {
    const apiRpc = {
      send: jest.fn((pattern: string, payload: Record<string, unknown>) => {
        if (pattern === 'tasks.findAll') {
          const st = payload?.status as string | undefined;
          if (st !== 'in_progress') {
            return of({ items: [] });
          }
          return of({
            items: [
              {
                id: 'task-cr2',
                title: 'shell',
                status: 'in_progress',
                requiresHumanApproval: false,
                assigneeType: 'agent',
                assigneeId: 'agent-1',
                metadata: {
                  skillName: 'code-run',
                  command: 'git status',
                  approvalRequestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                },
              },
            ],
          });
        }
        if (pattern === 'agents.effectiveSkillSnapshots') {
          return of({
            skills: [
              {
                id: 'sk1',
                name: 'code-run',
                description: null,
                toolSchema: { type: 'object', properties: {} },
                promptTemplate: null,
                implementationType: 'builtin',
                handlerConfig: null,
                requiredPermissions: [],
                version: 1,
                isPublic: true,
                isSystem: false,
              },
            ],
          });
        }
        if (pattern === 'billing.checkAllowance') {
          return of({ allowed: true });
        }
        if (pattern === 'approval.createExecutionToken') {
          return throwError(() => new Error('rpc down'));
        }
        if (pattern === 'tasks.update') {
          return of({});
        }
        if (pattern === 'tasks.executionLog.append') {
          return of({});
        }
        return of({});
      }),
    } as any;

    const config = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
      getApiRpcTimeoutMs: () => 5000,
      getBudgetApprovalThreshold: () => 0,
      getAgentSkillBudgetEstimate: () => 0.01,
      getCeoRequireExecutionToken: () => true,
      getPendingAgentTasksMaxPerTick: () => 20,
    } as any;

    const registry = { setAgentTools: jest.fn() } as any;
    const agentExecution = { executeSkill: jest.fn() } as any;
    const executionLog = { appendForTask: jest.fn() } as any;
    const monitoring = {
      incTaskExecutionResumedAfterApproval: jest.fn(),
      incTaskExecutionBlockedByApproval: jest.fn(),
    } as any;

    const messaging = { publish: jest.fn().mockResolvedValue(undefined) } as any;
    const l1Flags = { isEmployeeAutonomousEnabledForCompany: jest.fn().mockResolvedValue(false) } as any;
    const fileAssetsRegistration = {
      registerFromArtifacts: jest.fn().mockResolvedValue([]),
    } as any;
    const { unifiedDeliverable, deliverableGate } = defaultDeliverableDeps();

    const service = new PendingAgentTaskExecutionService(
      apiRpc,
      config,
      registry,
      agentExecution,
      executionLog,
      monitoring,
      messaging,
      l1Flags,
      fileAssetsRegistration,
      unifiedDeliverable as any,
      deliverableGate as any,
    );

    await service.processPendingForCompany('company-1');

    expect(agentExecution.executeSkill).not.toHaveBeenCalled();
    expect(apiRpc.send).toHaveBeenCalledWith(
      'tasks.update',
      expect.objectContaining({
        id: 'task-cr2',
        data: expect.objectContaining({
          status: 'paused',
          metadata: expect.objectContaining({
            autonomousExecution: expect.objectContaining({
              runnerExecSkipped: true,
              executionState: 'paused',
            }),
          }),
        }),
      }),
    );
  });
});

