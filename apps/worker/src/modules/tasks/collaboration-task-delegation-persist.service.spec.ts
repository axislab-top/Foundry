import { of } from 'rxjs';
import { CollaborationTaskDelegationPersistService } from './collaboration-task-delegation-persist.service.js';
import type { TaskDelegationRequestedEvent } from '@contracts/events';

describe('CollaborationTaskDelegationPersistService', () => {
  const event: TaskDelegationRequestedEvent = {
    eventId: 'e1',
    eventType: 'collaboration.task-delegation.requested',
    aggregateId: 'agg1',
    aggregateType: 'task',
    occurredAt: new Date().toISOString(),
    version: 1,
    companyId: 'co1',
    data: {
      companyId: 'co1',
      traceId: 'trace-1',
      fromAgentId: 'dir1',
      toAgentId: 'emp1',
      directorInitiated: true,
      delegation: {
        taskId: 'deleg-1',
        parentTaskId: 'l2-sub-1',
        ownerAgentId: 'dir1',
        executorAgentId: 'emp1',
        inputs: {
          directorSubTitle: '子任务 A',
          contentPreview: '完成调研',
          roomId: 'dept-room',
          directorInitiatedSubtask: true,
        },
        status: 'queued',
      },
      requestedAt: new Date().toISOString(),
    },
  };

  function setup() {
    const rpc = jest.fn().mockImplementation((pattern: string) => {
      if (pattern === 'tasks.findAll') return of({ items: [] });
      if (pattern === 'tasks.create') return of({ id: 'task-new-1' });
      return of({});
    });
    const apiRpc = { send: rpc };
    const config = {
      getWorkerActorUserId: () => 'worker',
      getApiRpcTimeoutMs: () => 5000,
    } as any;
    const tenantContext = {
      runWithCompanyId: async (_cid: string, fn: () => Promise<void>) => fn(),
    } as any;
    const pendingAgentTasks = {
      processPendingForCompany: jest.fn().mockResolvedValue(undefined),
    } as any;
    const svc = new CollaborationTaskDelegationPersistService(
      config,
      tenantContext,
      apiRpc as any,
      pendingAgentTasks,
    );
    return { svc, rpc, pendingAgentTasks };
  }

  it('creates agent task with assigneeId and parentId', async () => {
    const { svc, rpc, pendingAgentTasks } = setup();
    await svc.persistDelegationRequested(event);
    expect(rpc).toHaveBeenCalledWith(
      'tasks.create',
      expect.objectContaining({
        data: expect.objectContaining({
          assigneeType: 'agent',
          assigneeId: 'emp1',
          parentId: 'l2-sub-1',
        }),
      }),
    );
    expect(pendingAgentTasks.processPendingForCompany).toHaveBeenCalledWith('co1');
  });

  it('skips duplicate when idempotency key exists', async () => {
    const rpc = jest.fn().mockImplementation((pattern: string) => {
      if (pattern === 'tasks.findAll') {
        return of({
          items: [{ id: 'existing', metadata: { delegationIdempotencyKey: 'collab-delegation:deleg-1' } }],
        });
      }
      return of({});
    });
    const config = {
      getWorkerActorUserId: () => 'worker',
      getApiRpcTimeoutMs: () => 5000,
    } as any;
    const tenantContext = {
      runWithCompanyId: async (_cid: string, fn: () => Promise<void>) => fn(),
    } as any;
    const pendingAgentTasks = { processPendingForCompany: jest.fn() } as any;
    const svc = new CollaborationTaskDelegationPersistService(
      config,
      tenantContext,
      { send: rpc } as any,
      pendingAgentTasks,
    );
    await svc.persistDelegationRequested(event);
    expect(rpc).not.toHaveBeenCalledWith('tasks.create', expect.anything());
  });
});
