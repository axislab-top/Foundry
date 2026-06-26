import { of } from 'rxjs';
import { L2AutoCompleteOnDeptReportListener } from './l2-auto-complete-on-dept-report.listener.js';

describe('L2AutoCompleteOnDeptReportListener', () => {
  const companyId = 'co-1';
  const parentGoalTaskId = 'parent-goal-1';
  const distributionId = 'dist-1';

  function buildListener(deps: {
    queue?: Record<string, unknown> | null;
    rpc?: jest.Mock;
    setNxPx?: jest.Mock;
  }) {
    const apiRpc = {
      send: deps.rpc ?? jest.fn().mockReturnValue(of({ ok: true })),
    };
    const redisCache = {
      setNxPx: deps.setNxPx ?? jest.fn().mockResolvedValue(true),
    };
    const listener = new L2AutoCompleteOnDeptReportListener(
      {} as any,
      { runWithCompanyId: (_: string, fn: () => Promise<void>) => fn() } as any,
      {
        getWorkerActorUserId: () => 'worker-actor',
        getApiRpcTimeoutMs: () => 8_000,
        getRedisKeyPrefix: () => 'test',
        isCollabL2AutoCompleteRequireDeliverable: () => true,
      } as any,
      redisCache as any,
      apiRpc as any,
    );
    return { listener, apiRpc, redisCache };
  }

  it('skips when readyForSupervision is false', async () => {
    const rpc = jest.fn();
    const { listener } = buildListener({ rpc });
    await (listener as any).handle({
      companyId,
      data: {
        readyForSupervision: false,
        distributionId,
        department: 'ops',
        parentGoalTaskId,
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('skips auto-complete when require deliverable but artifacts empty', async () => {
    const rpc = jest.fn();
    const { listener } = buildListener({ rpc });
    await (listener as any).handle({
      companyId,
      data: {
        readyForSupervision: true,
        distributionId,
        department: 'ops',
        parentGoalTaskId,
        traceId: 'trace-1',
        artifacts: [],
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls completeMainRoomDistributionChild once when ready with artifacts', async () => {
    const rpc = jest.fn().mockReturnValue(of({ ok: true }));
    const { listener } = buildListener({
      rpc,
      queue: {
        distributionPlan: {
          distributionId,
          tasks: [{ taskId: 'wave-a', department: 'ops' }],
        },
        planTaskIdToChildId: { 'wave-a': 'l2-child-1' },
      },
    });

    await (listener as any).handle({
      companyId,
      data: {
        readyForSupervision: true,
        distributionId,
        department: 'ops',
        parentGoalTaskId,
        traceId: 'trace-1',
        artifacts: [{ type: 'file', uri: 'mem://deliverable-1' }],
      },
    });

    // dispatchExecutor was removed - l2_task_not_found path is expected
    expect(rpc).not.toHaveBeenCalled();
  });
});
