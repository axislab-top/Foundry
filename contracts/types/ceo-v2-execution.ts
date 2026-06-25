/**
 * CEO v2 公司化执行：显式执行图、门闸与协调协议（Temporal / Supervisor 单一真相源）。
 */

import type { DistributionExecutionSemantics, DistributionPlan } from './ceo-v2.js';
import {
  analyzeDistributionExecutionGraph,
  CeoV2ExecutionGraphError,
} from './ceo-v2-graph.js';

/** EmployeeExecutionResult.metadata 中与跨部门协调约定相关的键（单一真相，禁止散落魔法字符串）。 */
export const CeoV2CoordinationMetadataKey = {
  targetDepartment: 'coordinationTargetDepartment',
  reason: 'coordinationReason',
  targetDepartmentLegacySnake: 'coordination_target_department',
  reasonLegacySnake: 'coordination_reason',
} as const;

/** 进入任务前的门闸：仅依赖满足 vs 尚需 Supervisor 放行。 */
export type GateKind = 'dependency_only' | 'supervisor_release';

/** 执行图节点：在 DistributionPlan.task 基础上增加门闸语义。 */
export interface ExecutionTaskNode {
  taskId: string;
  department: string;
  ownerAgent: string;
  priority: 'P0' | 'P1' | 'P2';
  dependencies: string[];
  slaSeconds: number;
  deliverable: string;
  phaseTitle?: string;
  phaseOutcome?: string;
  phaseDeadline?: string;
  phaseOrdinal?: number;
  phaseCount?: number;
  strategicGoalSummary?: string;
  strategicPhaseId?: string;
  phaseStepIndex?: number;
  /**
   * 进入本任务前是否必须经过 Supervisor 放行（首任务或无前置依赖链时可缺省）。
   * 主群串行管线默认：有依赖的任务为 supervisor_release。
   */
  incomingGate?: GateKind;
}

export interface ExecutionEdge {
  fromTaskId: string;
  toTaskId: string;
}

/** 协调子任务模板（由 Orchestration 编译，Root 负责下发）。 */
export interface CoordinationTaskSpec {
  coordTaskId: string;
  targetDepartment: string;
  objective: string;
  blocksTaskId: string;
  responseSchemaHint?: string;
}

/** 运行期：子部门向 Root 请求协调。 */
export interface CoordinationRequest {
  requestId: string;
  distributionId: string;
  fromTaskId: string;
  fromDepartment: string;
  targetDepartment: string;
  reason: string;
  deadlineAt?: string;
  metadata?: Record<string, unknown>;
}

/** 运行期：协调任务闭环结果。 */
export interface CoordinationOutcome {
  requestId: string;
  coordinationTaskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  summary: string;
  metadata?: Record<string, unknown>;
}

/**
 * 执行计划：DAG + 门闸 + 与 DistributionPlan 同步。
 * schemaVersion 独立于 DistributionPlan.schemaVersion。
 */
export interface ExecutionPlan {
  schemaVersion: '1.0';
  executionPlanId: string;
  distributionId: string;
  planId: string;
  executionSemantics?: DistributionExecutionSemantics;
  nodes: ExecutionTaskNode[];
  edges: ExecutionEdge[];
  parallelism: DistributionPlan['parallelism'];
  fallbackPolicy: DistributionPlan['fallbackPolicy'];
  traceId: string;
  planAnchorMessageId?: string;
  turnMessageId?: string;
  routingRootMessageId?: string;
  runId?: string;
  ceoStructuredContract?: '2026.pr4';
  metadata?: Record<string, unknown>;
}

export interface DistributionPlanToExecutionPlanOptions {
  /**
   * 有上游依赖的任务默认门闸。
   * 主群 CEO 串行：`supervisor_release`；纯依赖不求汇报可用 `dependency_only`。
   */
  incomingGateForDependentTasks?: GateKind;
  /**
   * 默认 true：校验 DAG（非法则抛 {@link CeoV2ExecutionGraphError}），且 `ExecutionPlan.nodes` **按拓扑序**
   * 排列以与 Root 波次一致。仅迁移/回放极端场景可 false（不推荐）。
   */
  validateExecutionGraph?: boolean;
}

/** 由 DistributionPlan.tasks + dependencies 推导 ExecutionPlan（边集与节点门闸）。 */
export function distributionPlanToExecutionPlan(
  plan: DistributionPlan,
  opts?: DistributionPlanToExecutionPlanOptions,
): ExecutionPlan {
  const incomingGateForDependentTasks = opts?.incomingGateForDependentTasks ?? 'supervisor_release';
  const validate = opts?.validateExecutionGraph !== false;

  let tasksForNodes = plan.tasks;
  let orderedTaskIds: string[] | undefined;
  if (validate) {
    const g = analyzeDistributionExecutionGraph(plan.tasks);
    if (g.ok === false) {
      throw new CeoV2ExecutionGraphError(g.issue);
    }
    tasksForNodes = g.ordered;
    orderedTaskIds = g.orderedTaskIds;
  }

  const nodes: ExecutionTaskNode[] = tasksForNodes.map((t) => {
    const hasDeps = (t.dependencies?.length ?? 0) > 0;
    return {
      ...t,
      incomingGate: hasDeps ? incomingGateForDependentTasks : undefined,
    };
  });

  const edgeSet = new Set<string>();
  const edges: ExecutionEdge[] = [];
  for (const t of plan.tasks) {
    for (const d of t.dependencies ?? []) {
      const from = String(d ?? '').trim();
      const to = String(t.taskId ?? '').trim();
      if (!from || !to) continue;
      const key = `${from}->${to}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ fromTaskId: from, toTaskId: to });
    }
  }

  const execMeta =
    orderedTaskIds?.length || (plan.metadata && typeof plan.metadata === 'object')
      ? {
          ...(plan.metadata && typeof plan.metadata === 'object' ? { ...plan.metadata } : {}),
          ...(orderedTaskIds?.length
            ? {
                ceoV2ExecutionGraph: {
                  orderedTaskIds,
                  nodeOrder: 'topological' as const,
                },
              }
            : {}),
        }
      : undefined;

  return {
    schemaVersion: '1.0',
    executionPlanId: `exec-${plan.distributionId}`,
    distributionId: plan.distributionId,
    planId: plan.planId,
    executionSemantics: plan.executionSemantics,
    nodes,
    edges,
    parallelism: plan.parallelism,
    fallbackPolicy: plan.fallbackPolicy,
    traceId: plan.traceId,
    planAnchorMessageId: plan.planAnchorMessageId,
    turnMessageId: plan.turnMessageId,
    routingRootMessageId: plan.routingRootMessageId,
    runId: plan.runId,
    ceoStructuredContract: plan.ceoStructuredContract,
    metadata: execMeta,
  };
}

/** 去掉 Execution 特有字段，还原为可持久化的 DistributionPlan.task 行。 */
export function executionTaskNodeToDistributionTask(
  n: ExecutionTaskNode,
): DistributionPlan['tasks'][number] {
  const { incomingGate: _ig, ...rest } = n;
  return rest;
}

/** ExecutionPlan → DistributionPlan（tasks 不含 incomingGate；附带 executionPlan 引用）。 */
export function executionPlanToDistributionPlan(exec: ExecutionPlan): DistributionPlan {
  const tasks = exec.nodes.map(executionTaskNodeToDistributionTask);
  return {
    schemaVersion: '1.0',
    distributionId: exec.distributionId,
    planId: exec.planId,
    executionSemantics: exec.executionSemantics,
    tasks,
    parallelism: exec.parallelism,
    fallbackPolicy: exec.fallbackPolicy,
    traceId: exec.traceId,
    planAnchorMessageId: exec.planAnchorMessageId,
    turnMessageId: exec.turnMessageId,
    routingRootMessageId: exec.routingRootMessageId,
    runId: exec.runId,
    ceoStructuredContract: exec.ceoStructuredContract,
    metadata: exec.metadata,
    executionPlan: exec,
  };
}

/**
 * 运行期协调任务编译（类型化，供 Root / Orchestration 调用）。
 */
export function compileCoordinationTaskSpec(params: {
  request: CoordinationRequest;
  distributionId: string;
  planId: string;
}): CoordinationTaskSpec {
  const rid = String(params.request.requestId ?? '').trim() || `coord-req-${Date.now()}`;
  return {
    coordTaskId: `coord-${params.planId}-${rid}`.slice(0, 200),
    targetDepartment: String(params.request.targetDepartment ?? '').trim(),
    objective: [
      `【协调请求】来源任务 ${params.request.fromTaskId}（${params.request.fromDepartment}）`,
      `【事由】${String(params.request.reason ?? '').trim()}`,
      `【期望协作方】${String(params.request.targetDepartment ?? '').trim()} 提供接口 / 资料 / 结论并在主线程留痕`,
    ].join('\n'),
    blocksTaskId: String(params.request.fromTaskId ?? '').trim(),
    responseSchemaHint: 'free_text_summary',
  };
}
