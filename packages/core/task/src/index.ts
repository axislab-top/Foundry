/**
 * 数字公司任务域：与 DB 枚举对齐的共享类型 + 纯函数校验。
 */

export type TaskRunTriggerSource =
  | 'temporal'
  | 'schedule'
  | 'manual'
  | 'nest_timer';

export type TaskRunStatus = 'running' | 'succeeded' | 'failed';

export type DigitalTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'awaiting_approval'
  | 'completed'
  | 'blocked'
  | 'cancelled';

/** 依赖边：taskId 依赖 dependsOnTaskId（前置完成后才能开始后序）→ 有向边 dependsOnTaskId → taskId */
export type TaskDependencyEdge = {
  taskId: string;
  dependsOnTaskId: string;
};

/**
 * 检测依赖图是否存在环。边语义：from=前置，to=后序。
 */
export function dependencyGraphHasCycle(
  edges: ReadonlyArray<{ from: string; to: string }>,
): boolean {
  const adj = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.from);
    nodes.add(e.to);
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const dfs = (u: string): boolean => {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const s = state.get(v) ?? 0;
      if (s === 1) return true;
      if (s === 0 && dfs(v)) return true;
    }
    state.set(u, 2);
    return false;
  };
  for (const n of nodes) {
    if ((state.get(n) ?? 0) === 0 && dfs(n)) return true;
  }
  return false;
}

/**
 * 将 task_dependencies 行转为有向边并检测环。
 */
export function validateTaskDependencyRows(
  rows: ReadonlyArray<TaskDependencyEdge>,
): { ok: true } | { ok: false; reason: 'cycle' } {
  const edges = rows.map((r) => ({
    from: r.dependsOnTaskId,
    to: r.taskId,
  }));
  if (dependencyGraphHasCycle(edges)) {
    return { ok: false, reason: 'cycle' };
  }
  return { ok: true };
}
