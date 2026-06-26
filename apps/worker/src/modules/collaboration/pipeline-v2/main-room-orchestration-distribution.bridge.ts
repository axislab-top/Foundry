import type { CeoV2DistributionDraft, DistributionPlan, ExecutionPlan } from '@contracts/types';
import { DEFAULT_FALLBACK_DEPARTMENT_SLUG } from '../ceo/v2/resolve-assignable-departments.js';
import type {
  DistributionPlan as CollaborationDistributionPlan2026,
  HeavyExecutionOutput as CollaborationHeavyExecutionOutput2026,
  PlanningResult as CollaborationPlanningResult2026,
} from '../contracts/collaboration-2026.contracts.js';

export function to2026DistributionPlan(params: {
  planning: CollaborationPlanningResult2026;
  distribution: DistributionPlan & { executionPlan?: ExecutionPlan };
}): CollaborationDistributionPlan2026 {
  const tasks = Array.isArray(params.distribution?.tasks) ? params.distribution.tasks : [];
  const taskById = new Map(
    tasks
      .map((t) => [String((t as { taskId?: string }).taskId ?? '').trim(), t] as const)
      .filter(([id]) => Boolean(id)),
  );
  const ep = params.distribution?.executionPlan;
  const executionPlanDigest =
    ep && ep.schemaVersion
      ? {
          schemaVersion: ep.schemaVersion,
          distributionId: ep.distributionId,
          taskCount: ep.nodes?.length ?? 0,
          edgeCount: ep.edges?.length ?? 0,
          supervisorReleaseGateCount: ep.nodes?.filter((n) => n.incomingGate === 'supervisor_release').length ?? 0,
        }
      : undefined;

  return {
    traceId: params.planning.traceId,
    planningId: params.planning.traceId,
    roomId: params.planning.roomId,
    roomType: params.planning.roomType,
    ceoStructuredContract: '2026.pr4',
    parallelism: {
      enabled: (tasks?.length ?? 0) > 1,
      maxParallelDepartments: Math.max(
        1,
        Number(params.distribution?.parallelism?.maxConcurrentDepartments ?? Math.min(4, Math.max(1, tasks.length))),
      ),
    },
    ...(executionPlanDigest ? { executionPlanDigest } : {}),
    departmentTasks: tasks.slice(0, 24).map((task) => {
      const raw = task as DistributionPlan['tasks'][number];
      const tid = String(raw.taskId ?? '').trim();
      const deps = Array.isArray(raw.dependencies) ? raw.dependencies : [];
      const depSlugs = deps
        .map((d) => taskById.get(String(d ?? '').trim()))
        .map((t) => (t ? String(t.department ?? '').trim() : ''))
        .filter((s) => s.length > 0)
        .filter((s, i, arr) => arr.indexOf(s) === i);
      return {
        ...(tid ? { sourceTaskId: tid } : {}),
        departmentSlug: String(raw.department ?? '').trim() || DEFAULT_FALLBACK_DEPARTMENT_SLUG,
        directorAgentId: typeof raw.ownerAgent === 'string' ? String(raw.ownerAgent) : null,
        priority:
          String(raw.priority ?? '').trim().toLowerCase() === 'p0'
            ? 'p0'
            : String(raw.priority ?? '').trim().toLowerCase() === 'p2'
              ? 'p2'
              : 'p1',
        objective: params.planning.strategyGoal,
        deliverables: [String(raw.deliverable ?? '').trim() || params.planning.strategyGoal].slice(0, 6),
        ...(depSlugs.length ? { dependsOnDepartmentSlugs: depSlugs } : {}),
        dueAt: undefined,
      };
    }),
  };
}

export function formatDistributionPlanDraftForMainRoom(plan: DistributionPlan): string {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  if (tasks.length === 0) return '';
  const lines = tasks.map((t, idx) => {
    const dept = String(t?.department ?? '').trim() || '未指定部门';
    let del = String(t?.deliverable ?? '').trim() || '（无交付物描述）';
    if (del.length > 360) del = `${del.slice(0, 360)}…`;
    const pri = String(t?.priority ?? 'P1').trim();
    const depsRaw = (t as { dependencies?: unknown }).dependencies;
    const deps = Array.isArray(depsRaw) ? depsRaw.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
    const depHint = deps.length ? ' · 需前置任务完成后派发' : ' · 无前置依赖';
    return `• ${idx + 1}. 部门「${dept}」${depHint}：${del}（优先级 ${pri}）`;
  });
  return `【任务拆分卡（编排草案，确认后按依赖顺序下发部门）】\n${lines.join('\n')}`;
}

export function buildDistributionDraftSurfacePayload(plan: DistributionPlan): CeoV2DistributionDraft | undefined {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  if (tasks.length === 0) return undefined;
  const MAX_ROWS = 24;
  const MAX_DEPT = 64;
  const MAX_PRI = 8;
  const MAX_DEL = 480;
  return {
    schemaVersion: '1.0',
    distributionId: String(plan.distributionId ?? '').trim().slice(0, 128),
    planId: String(plan.planId ?? '').trim().slice(0, 128),
    pendingDepartmentDispatchConfirm: true,
    rows: tasks.slice(0, MAX_ROWS).map((t) => ({
      department: String(t?.department ?? '').trim().slice(0, MAX_DEPT) || '—',
      priority: String(t?.priority ?? 'P1').trim().slice(0, MAX_PRI) || 'P1',
      deliverable: String(t?.deliverable ?? '').trim().slice(0, MAX_DEL) || '—',
    })),
  };
}

export function to2026HeavyExecutionOutput(params: {
  planning: CollaborationPlanningResult2026;
  distribution: CollaborationDistributionPlan2026;
  heavyLegacy: Record<string, unknown> | null;
}): CollaborationHeavyExecutionOutput2026 {
  const legacy = params.heavyLegacy ?? {};
  const status = String(legacy['status'] ?? 'completed').trim().toLowerCase();
  const deptRows = Array.isArray(legacy['departmentResults']) ? (legacy['departmentResults'] as Array<any>) : [];
  const finalText = String(legacy['finalText'] ?? '').trim() || 'supervision 执行完成。';
  return {
    traceId: params.planning.traceId,
    ceoStructuredContract: '2026.pr4',
    workflowId:
      typeof legacy['metadata'] === 'object' &&
      legacy['metadata'] &&
      typeof (legacy['metadata'] as Record<string, unknown>)['temporalWorkflowId'] === 'string'
        ? String((legacy['metadata'] as Record<string, unknown>)['temporalWorkflowId'])
        : undefined,
    roomId: params.planning.roomId,
    roomType: params.planning.roomType,
    stages:
      status === 'failed'
        ? ['proposed', 'approved', 'in_progress', 'blocked']
        : ['proposed', 'approved', 'in_progress', 'done', 'reviewed'],
    partials: [
      {
        at: new Date().toISOString(),
        stage: status === 'failed' ? 'blocked' : 'done',
        text: status === 'failed' ? 'supervision 返回失败状态，已记录并等待后续处理。' : 'supervision 已完成汇总并回传结果。',
      },
    ],
    departmentResults:
      deptRows.length > 0
        ? deptRows.map((row) => ({
            departmentSlug: String(row?.department ?? '').trim() || DEFAULT_FALLBACK_DEPARTMENT_SLUG,
            status:
              String(row?.status ?? '').trim() === 'ok'
                ? 'ok'
                : String(row?.status ?? '').trim() === 'failed'
                  ? 'failed'
                  : 'partial',
            summary: String(row?.summary ?? '').trim() || 'no_summary',
            evidenceRefs: [],
          }))
        : params.distribution.departmentTasks.map((task) => ({
            departmentSlug: task.departmentSlug,
            status: 'partial' as const,
            summary: '任务已下发，等待部门结果回传。',
            evidenceRefs: [],
          })),
    finalText: finalText.slice(0, 8000),
    finalSummary: `strategy=${params.planning.strategyGoal.slice(0, 120)}; departments=${params.distribution.departmentTasks.length}`,
    blockedReason: status === 'failed' ? String(legacy['deltaReason'] ?? 'supervision_failed') : undefined,
  };
}
