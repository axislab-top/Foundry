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

function readGoalPreview(contextBundle: string | undefined): string {
  try {
    const o = JSON.parse(String(contextBundle ?? '{}')) as Record<string, unknown>;
    const g = o.goalPreview ?? o.contentPreview;
    return typeof g === 'string' ? g.slice(0, 400) : '';
  } catch {
    return '';
  }
}

/**
 * W10：员工 Agent 自主子图 — 轻量 quick-execute → report（与 Director 四节点子图风格一致，节点更少）。
 */
export function buildEmployeeTaskSubGraph(): StateGraph<any> {
  const quickExecuteNode = async (state: CeoSupervisorState) => {
    const meta = safeParseMeta(state.hierarchicalMetaJson);
    const preview = readGoalPreview(state.contextBundle) || state.goal.slice(0, 400);
    meta.employeeTaskGraph = {
      phase: 'quick_execute',
      at: new Date().toISOString(),
      preview,
    };
    return { hierarchicalMetaJson: JSON.stringify(meta) };
  };

  const reportNode = async (state: CeoSupervisorState) => {
    const meta = safeParseMeta(state.hierarchicalMetaJson);
    const prev = (meta.employeeTaskGraph as Record<string, unknown> | undefined) ?? {};
    meta.employeeTaskGraph = { ...prev, phase: 'report', at: new Date().toISOString() };
    const draft = `[Employee task graph] quick-execute→report 完成；trace=${state.traceId}`;
    return { hierarchicalMetaJson: JSON.stringify(meta), reportDraft: draft };
  };

  return new StateGraph(CeoSupervisorAnnotation)
    .addNode('quick_execute', quickExecuteNode)
    .addNode('report', reportNode)
    .addEdge(START, 'quick_execute')
    .addEdge('quick_execute', 'report')
    .addEdge('report', END) as StateGraph<any>;
}
