import { END, START, StateGraph } from '@langchain/langgraph';
import { CeoSupervisorAnnotation, type CeoSupervisorState } from './ceo-state.js';

function safeParseMeta(json: string | undefined): Record<string, unknown> {
  try {
    const o = JSON.parse(String(json ?? '{}')) as unknown;
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readPlannedSubtasks(contextBundle: string | undefined): Array<{ title: string }> {
  try {
    const o = JSON.parse(String(contextBundle ?? '{}')) as Record<string, unknown>;
    const raw = o.subtasks;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => {
        if (x && typeof x === 'object' && typeof (x as { title?: unknown }).title === 'string') {
          return { title: String((x as { title: string }).title).slice(0, 240) };
        }
        if (typeof x === 'string') return { title: x.slice(0, 240) };
        return null;
      })
      .filter((x): x is { title: string } => !!x?.title);
  } catch {
    return [];
  }
}

/**
 * W9：Director 自主「任务子图」——线性 plan → assign → execute → report。
 * 与 `hierarchicalExpand` 触发的动态子图共用 {@link CeoSupervisorAnnotation}，仅写 `hierarchicalMetaJson` / `reportDraft`，无 RPC。
 */
export function buildDirectorTaskSubGraph(): StateGraph<any> {
  const planNode = async (state: CeoSupervisorState) => {
    const meta = safeParseMeta(state.hierarchicalMetaJson);
    const planned = readPlannedSubtasks(state.contextBundle);
    meta.directorTaskGraph = {
      phase: 'plan',
      at: new Date().toISOString(),
      plannedSubtasks: planned.slice(0, 8),
    };
    return { hierarchicalMetaJson: JSON.stringify(meta) };
  };

  const assignNode = async (state: CeoSupervisorState) => {
    const meta = safeParseMeta(state.hierarchicalMetaJson);
    const prev = (meta.directorTaskGraph as Record<string, unknown> | undefined) ?? {};
    meta.directorTaskGraph = { ...prev, phase: 'assign', at: new Date().toISOString() };
    return { hierarchicalMetaJson: JSON.stringify(meta) };
  };

  const executeNode = async (state: CeoSupervisorState) => {
    const meta = safeParseMeta(state.hierarchicalMetaJson);
    const prev = (meta.directorTaskGraph as Record<string, unknown> | undefined) ?? {};
    meta.directorTaskGraph = { ...prev, phase: 'execute', at: new Date().toISOString() };
    return { hierarchicalMetaJson: JSON.stringify(meta) };
  };

  const reportNode = async (state: CeoSupervisorState) => {
    const meta = safeParseMeta(state.hierarchicalMetaJson);
    const prev = (meta.directorTaskGraph as Record<string, unknown> | undefined) ?? {};
    meta.directorTaskGraph = { ...prev, phase: 'report', at: new Date().toISOString() };
    const planned = Array.isArray((prev as { plannedSubtasks?: unknown }).plannedSubtasks)
      ? ((prev as { plannedSubtasks: unknown[] }).plannedSubtasks as unknown[]).length
      : 0;
    const draft = `[Director task graph] plan→assign→execute→report 完成；规划子项数=${planned}；trace=${state.traceId}`;
    return { hierarchicalMetaJson: JSON.stringify(meta), reportDraft: draft };
  };

  return new StateGraph(CeoSupervisorAnnotation)
    .addNode('plan', planNode)
    .addNode('assign', assignNode)
    .addNode('execute', executeNode)
    .addNode('report', reportNode)
    .addEdge(START, 'plan')
    .addEdge('plan', 'assign')
    .addEdge('assign', 'execute')
    .addEdge('execute', 'report')
    .addEdge('report', END) as StateGraph<any>;
}
