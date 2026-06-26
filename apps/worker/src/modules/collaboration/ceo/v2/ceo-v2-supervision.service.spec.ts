import { CeoV2SupervisionService } from './ceo-v2-supervision.service.js';

describe('CeoV2SupervisionService', () => {
  function makePlan() {
    return {
      schemaVersion: '1.0',
      distributionId: 'dist-1',
      planId: 'plan-1',
      tasks: [
        {
          taskId: 'task-1',
          department: 'ops',
          ownerAgent: 'director_ops',
          priority: 'P1',
          dependencies: [],
          slaSeconds: 900,
          deliverable: 'd1',
        },
        {
          taskId: 'task-2',
          department: 'finance',
          ownerAgent: 'director_finance',
          priority: 'P1',
          dependencies: [],
          slaSeconds: 900,
          deliverable: 'd2',
        },
      ],
      parallelism: { maxConcurrentDepartments: 2 },
      fallbackPolicy: { onTimeout: 'partial_merge', onDepartmentFailure: 'retry_then_degrade' },
      traceId: 'trace-1',
      metadata: { companyId: 'c1' },
    } as any;
  }

  const baseConfig = {
    getWorkerActorUserId: jest.fn(() => 'worker'),
    getCeoV2ToolSurfaceMode: jest.fn(() => 'off'),
    getCeoV2ToolSurfaceAllowlist: jest.fn(() => []),
    getCollabSupervisionInputMode: jest.fn(() => 'inline_skill' as const),
  } as any;

  function makeSvc(
    employeeExecution: { executeTask: jest.Mock },
    layerConfigResolver?: { resolveLayerSetting: jest.Mock },
  ) {
    const deptReportBuffer = {
      listDirectorReports: jest.fn().mockResolvedValue([]),
    } as any;
    const ceoLayerTools = {
      build: jest.fn().mockResolvedValue({
        tools: [],
        injectedToolNames: [],
        configuredSkillIds: [],
        dedupeDroppedCount: 0,
        boundMcpToolNames: [],
        skillCatalog: [],
      }),
    } as any;
    return new CeoV2SupervisionService(
      baseConfig,
      {} as any,
      layerConfigResolver ?? ({ resolveLayerSetting: jest.fn().mockResolvedValue({}) } as any),
      {} as any,
      ceoLayerTools,
      {} as any,
      {} as any,
      employeeExecution as any,
      deptReportBuffer,
      {} as any,
      {} as any,
    );
  }

  it('fails fast when compensationOnTimeout is fail_fast', async () => {
    const layerConfigResolver = {
      resolveLayerSetting: jest.fn().mockResolvedValue({
        timeoutMs: 60_000,
        specialConfig: {
          compensationOnTimeout: 'fail_fast',
        },
      }),
    } as any;
    const employeeExecution = {
      executeTask: jest.fn(async (pkg: { taskId: string; department: string }) => ({
        taskId: pkg.taskId,
        department: pkg.department,
        status: 'timeout',
        summary: 'timeout',
      })),
    } as any;
    const svc = makeSvc(employeeExecution, layerConfigResolver);

    const out = await svc.supervise(makePlan());
    expect(out.status).toBe('failed');
    expect(out.deltaReason).toContain('timeout');
    expect(employeeExecution.executeTask).toHaveBeenCalled();
  });

  it('forces failed on department failure when configured fail_fast', async () => {
    const layerConfigResolver = {
      resolveLayerSetting: jest.fn().mockResolvedValue({
        specialConfig: {
          compensationOnDepartmentFailure: 'fail_fast',
        },
      }),
    } as any;
    const employeeExecution = {
      executeTask: jest.fn(async (pkg: { taskId: string; department: string }) => ({
        taskId: pkg.taskId,
        department: pkg.department,
        status: 'failed',
        summary: 'failed',
      })),
    } as any;
    const svc = makeSvc(employeeExecution, layerConfigResolver);

    const out = await svc.supervise(makePlan());
    expect(out.status).toBe('failed');
    expect(out.deltaReason).toContain('department_failure');
    expect(employeeExecution.executeTask).toHaveBeenCalled();
  });

  it('executes tasks in topological order when dependencies chain and maxConcurrentDepartments is 1', async () => {
    const order: string[] = [];
    const layerConfigResolver = {
      resolveLayerSetting: jest.fn().mockResolvedValue({
        timeoutMs: 60_000,
        specialConfig: {},
      }),
    } as any;
    const employeeExecution = {
      executeTask: jest.fn(async (pkg: { taskId: string }) => {
        order.push(pkg.taskId);
        return { taskId: pkg.taskId, department: 'ops', status: 'ok', summary: 'ok' };
      }),
    } as any;
    const svc = makeSvc(employeeExecution, layerConfigResolver);

    const plan = {
      schemaVersion: '1.0',
      distributionId: 'dist-1',
      planId: 'plan-1',
      tasks: [
        {
          taskId: 't-a',
          department: 'ops',
          ownerAgent: 'director_ops',
          priority: 'P1',
          dependencies: [],
          slaSeconds: 900,
          deliverable: 'a',
        },
        {
          taskId: 't-b',
          department: 'ops',
          ownerAgent: 'director_ops',
          priority: 'P1',
          dependencies: ['t-a'],
          slaSeconds: 900,
          deliverable: 'b',
        },
        {
          taskId: 't-c',
          department: 'ops',
          ownerAgent: 'director_ops',
          priority: 'P1',
          dependencies: ['t-b'],
          slaSeconds: 900,
          deliverable: 'c',
        },
      ],
      parallelism: { maxConcurrentDepartments: 1 },
      fallbackPolicy: { onTimeout: 'partial_merge', onDepartmentFailure: 'retry_then_degrade' },
      traceId: 'trace-1',
      metadata: { companyId: 'c1' },
    } as any;

    await svc.supervise(plan);
    expect(order).toEqual(['t-a', 't-b', 't-c']);
  });

  it('merges employee skill summaries into supervision finalText', async () => {
    const layerConfigResolver = {
      resolveLayerSetting: jest.fn().mockResolvedValue({
        timeoutMs: 60_000,
        specialConfig: {},
      }),
    } as any;
    const employeeExecution = {
      executeTask: jest.fn(async (pkg: { taskId: string; department: string }) => ({
        taskId: pkg.taskId,
        department: pkg.department,
        status: 'ok',
        summary: 'SKILL_JSON:{"done":true}',
      })),
    } as any;
    const svc = makeSvc(employeeExecution, layerConfigResolver);

    const out = await svc.supervise(makePlan());
    expect(out.finalText).toContain('SKILL_JSON:{"done":true}');
    expect(out.metadata?.supervisionResultSource).toBe('skill_execution');
  });

  it('passes department roomId from metadata to executeTask when available', async () => {
    const layerConfigResolver = {
      resolveLayerSetting: jest.fn().mockResolvedValue({
        timeoutMs: 60_000,
        specialConfig: {},
      }),
    } as any;
    const capturedPkgs: Array<{ metadata?: { roomId?: string } }> = [];
    const employeeExecution = {
      executeTask: jest.fn(async (pkg: { taskId: string; department: string; metadata?: { roomId?: string } }) => {
        capturedPkgs.push(pkg);
        return { taskId: pkg.taskId, department: pkg.department, status: 'ok', summary: 'done' };
      }),
    } as any;
    const svc = makeSvc(employeeExecution, layerConfigResolver);

    const plan = makePlan();
    // 设置主群 roomId
    plan.metadata.roomId = 'main-room-id';

    await svc.supervise(plan);

    // 两个 task 都应被调用
    expect(employeeExecution.executeTask).toHaveBeenCalledTimes(2);
    // 由于没有部门房间映射（resolveDepartmentRoomMap RPC 会失败/返回空），roomId 应 fallback 到主群
    for (const pkg of capturedPkgs) {
      expect(pkg.metadata?.roomId).toBe('main-room-id');
    }
  });
});
