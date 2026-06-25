/**
 * CEO v2 执行图（DAG）——编排编译器与 Temporal 共用。
 * 纯函数、无 IO，可在 Worker / API / 测试中一致使用。
 */

import type { DistributionPlan } from './ceo-v2.js';

export type DistributionTask = DistributionPlan['tasks'][number];

/** 机器可读：编排图校验失败（HTTP / Temporal / 日志可统一解析）。 */
export const CEO_V2_EXECUTION_GRAPH_INVALID = 'CEO_V2_EXECUTION_GRAPH_INVALID' as const;

/** 编排图不可执行的原因。 */
export type DistributionExecutionGraphIssue =
  | {
      kind: 'duplicate_task_id';
      taskId: string;
    }
  | {
      kind: 'dangling_dependency';
      edges: Array<{ taskId: string; missingDependencyId: string }>;
    }
  | {
      kind: 'cycle';
      /** Kahn 剩余节点（环上或不可达）；顺序仅作诊断 */
      remainingTaskIds: string[];
    };

export type DistributionExecutionGraphAnalysis =
  | {
      ok: true;
      /** 拓扑序（同级稳定：按输入 tasks 原始顺序打破平局） */
      ordered: DistributionTask[];
      orderedTaskIds: string[];
    }
  | {
      ok: false;
      issue: DistributionExecutionGraphIssue;
    };

export class CeoV2ExecutionGraphError extends Error {
  readonly code = CEO_V2_EXECUTION_GRAPH_INVALID;

  constructor(public readonly issue: DistributionExecutionGraphIssue) {
    super(`${CEO_V2_EXECUTION_GRAPH_INVALID}:${formatDistributionGraphIssue(issue)}`);
    this.name = 'CeoV2ExecutionGraphError';
  }
}

/**
 * 校验 tasks 构成 **有限 DAG** 且依赖闭包在任务集内；成功则返回拓扑序。
 */
export function analyzeDistributionExecutionGraph(tasks: DistributionTask[]): DistributionExecutionGraphAnalysis {
  if (!tasks.length) {
    return { ok: true, ordered: [], orderedTaskIds: [] };
  }

  const seen = new Set<string>();
  for (const t of tasks) {
    const id = String(t.taskId ?? '').trim();
    if (!id) {
      return { ok: false, issue: { kind: 'duplicate_task_id', taskId: '' } };
    }
    if (seen.has(id)) {
      return { ok: false, issue: { kind: 'duplicate_task_id', taskId: id } };
    }
    seen.add(id);
  }

  const ids = new Set(tasks.map((t) => String(t.taskId ?? '').trim()));
  const dangling: Array<{ taskId: string; missingDependencyId: string }> = [];
  for (const t of tasks) {
    const tid = String(t.taskId ?? '').trim();
    for (const raw of t.dependencies ?? []) {
      const d = String(raw ?? '').trim();
      if (!d) continue;
      if (!ids.has(d)) {
        dangling.push({ taskId: tid, missingDependencyId: d });
      }
    }
  }
  if (dangling.length) {
    return { ok: false, issue: { kind: 'dangling_dependency', edges: dangling } };
  }

  const taskById = new Map(tasks.map((t) => [String(t.taskId ?? '').trim(), t] as const));
  const indeg = new Map<string, number>();
  for (const t of tasks) {
    const id = String(t.taskId ?? '').trim();
    const inc = (t.dependencies ?? []).filter((d) => ids.has(String(d ?? '').trim())).length;
    indeg.set(id, inc);
  }
  const orderIndex = (id: string) => tasks.findIndex((x) => String(x.taskId ?? '').trim() === id);
  const q: string[] = [];
  for (const t of tasks) {
    const id = String(t.taskId ?? '').trim();
    if ((indeg.get(id) ?? 0) === 0) q.push(id);
  }
  q.sort((a, b) => orderIndex(a) - orderIndex(b));

  const out: DistributionTask[] = [];
  while (q.length) {
    const id = q.shift()!;
    const node = taskById.get(id);
    if (node) out.push(node);
    for (const u of tasks) {
      const uid = String(u.taskId ?? '').trim();
      const deps = (u.dependencies ?? []).map((d) => String(d ?? '').trim());
      if (deps.includes(id)) {
        const v = (indeg.get(uid) ?? 0) - 1;
        indeg.set(uid, v);
        if (v === 0) q.push(uid);
      }
    }
    q.sort((a, b) => orderIndex(a) - orderIndex(b));
  }

  if (out.length !== tasks.length) {
    const remaining = tasks
      .map((t) => String(t.taskId ?? '').trim())
      .filter((id) => !out.some((x) => String(x.taskId ?? '').trim() === id));
    return {
      ok: false,
      issue: {
        kind: 'cycle',
        remainingTaskIds: remaining.length ? remaining : tasks.map((t) => String(t.taskId ?? '').trim()),
      },
    };
  }

  return {
    ok: true,
    ordered: out,
    orderedTaskIds: out.map((t) => String(t.taskId ?? '').trim()),
  };
}

export function formatDistributionGraphIssue(issue: DistributionExecutionGraphIssue): string {
  if (issue.kind === 'duplicate_task_id') {
    return `duplicate_task_id:${issue.taskId || '(empty)'}`;
  }
  if (issue.kind === 'dangling_dependency') {
    return `dangling_dependency:${issue.edges.map((e) => `${e.taskId}->${e.missingDependencyId}`).join(',')}`;
  }
  return `cycle:remaining=${issue.remainingTaskIds.join(',')}`;
}

/** 编译期 / 启动期断言：非法图抛 {@link CeoV2ExecutionGraphError}。 */
export function assertAcyclicExecutableDistributionTasks(tasks: DistributionTask[]): {
  ordered: DistributionTask[];
  orderedTaskIds: string[];
} {
  const g = analyzeDistributionExecutionGraph(tasks);
  if (g.ok === false) {
    throw new CeoV2ExecutionGraphError(g.issue);
  }
  return { ordered: g.ordered, orderedTaskIds: g.orderedTaskIds };
}
