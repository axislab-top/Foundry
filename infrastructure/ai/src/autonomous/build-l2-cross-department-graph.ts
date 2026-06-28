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

function safeParseBundle(contextBundle: string | undefined): Record<string, unknown> {
  try {
    const o = JSON.parse(String(contextBundle ?? '{}')) as unknown;
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 并行执行 Director/Employee 已注册子图（由 Registry 注入）。 */
export type L2CrossDeptParallelRunner = (
  state: CeoSupervisorState,
  ids: string[],
) => Promise<Array<Partial<CeoSupervisorState> | null>>;

/**
 * W11：L2 跨部门协调图（独立于 CEO 层级编排，仅供 `l2_cross_department` 节点 id 引用或 standalone invoke）。
 *
 * detectCrossDeptNeed → routeToDepartments → parallelSubgraphs → aggregateReport
 */
export function buildL2CrossDepartmentGraph(options?: {
  runParallelSubgraphs?: L2CrossDeptParallelRunner;
}): StateGraph<any> {
  const detectCrossDeptNeed = async (state: CeoSupervisorState) => {
    const meta = safeParseMeta(state.hierarchicalMetaJson);
    const bundle = safeParseBundle(state.contextBundle);
    const keyword =
      /跨部门|cross-department|cross\s*dept|crossDept/i.test(String(state.goal ?? '')) ||
      /跨部门|cross-department|cross\s*dept|crossDept/i.test(String(bundle.contentPreview ?? ''));
    const explicit = bundle.crossDepartmentSignal === true || bundle.crossDepartment === true;
    const need = explicit || keyword;
    meta.l2CrossDepartment = {
      phase: 'detectCrossDeptNeed',
      need,
      at: new Date().toISOString(),
    };
    return { hierarchicalMetaJson: JSON.stringify(meta) };
  };

  const routeToDepartments = async (state: CeoSupervisorState) => {
    const meta = safeParseMeta(state.hierarchicalMetaJson);
    const bundle = safeParseBundle(state.contextBundle);
    const raw = bundle.targetDepartmentNodeIds ?? bundle.mentionedNodeIds;
    const deptIds = Array.isArray(raw)
      ? raw.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 12)
      : [];
    meta.l2CrossDepartment = {
      ...(meta.l2CrossDepartment as Record<string, unknown>),
      phase: 'routeToDepartments',
      departments: deptIds,
      at: new Date().toISOString(),
    };
    return { hierarchicalMetaJson: JSON.stringify(meta) };
  };

  const parallelSubgraphs = async (state: CeoSupervisorState) => {
    const meta = safeParseMeta(state.hierarchicalMetaJson);
    const bundle = safeParseBundle(state.contextBundle);
    const defaultTargets = ['director_autonomous', 'employee_autonomous'];
    const targets = Array.isArray(bundle.l2ParallelSubGraphIds)
      ? (bundle.l2ParallelSubGraphIds as unknown[])
          .map((x) => String(x ?? '').trim())
          .filter(Boolean)
          .slice(0, 6)
      : defaultTargets;

    let outs: Array<Partial<CeoSupervisorState> | null> = [];
    if (options?.runParallelSubgraphs && targets.length > 0) {
      outs = await options.runParallelSubgraphs(state, targets);
    }

    const previews = outs.map((o, i) => ({
      i,
      draft: String(o?.reportDraft ?? '').slice(0, 600),
      hierarchicalMetaJson: String(o?.hierarchicalMetaJson ?? '').slice(0, 1200),
    }));

    meta.l2CrossDepartment = {
      ...(meta.l2CrossDepartment as Record<string, unknown>),
      phase: 'parallelSubgraphs',
      invoked: outs.length,
      targets,
      at: new Date().toISOString(),
    };
    meta.l2ParallelResults = previews;
    return { hierarchicalMetaJson: JSON.stringify(meta) };
  };

  const aggregateReport = async (state: CeoSupervisorState) => {
    const meta = safeParseMeta(state.hierarchicalMetaJson);
    const prev = meta.l2ParallelResults as Array<{ draft?: string }> | undefined;
    const lines = Array.isArray(prev) ? prev.map((p) => String(p?.draft ?? '').trim()).filter(Boolean) : [];
    const reportDraft = [`[L2 Cross-Department] aggregateReport`, ...lines.map((l) => `— ${l}`)]
      .join('\n')
      .slice(0, 8000);
    meta.l2CrossDepartment = {
      ...(meta.l2CrossDepartment as Record<string, unknown>),
      phase: 'aggregateReport',
      at: new Date().toISOString(),
    };
    return { hierarchicalMetaJson: JSON.stringify(meta), reportDraft };
  };

  return new StateGraph(CeoSupervisorAnnotation)
    .addNode('detect_cross_dept_need', detectCrossDeptNeed)
    .addNode('route_to_departments', routeToDepartments)
    .addNode('parallel_subgraphs', parallelSubgraphs)
    .addNode('aggregate_report', aggregateReport)
    .addEdge(START, 'detect_cross_dept_need')
    .addEdge('detect_cross_dept_need', 'route_to_departments')
    .addEdge('route_to_departments', 'parallel_subgraphs')
    .addEdge('parallel_subgraphs', 'aggregate_report')
    .addEdge('aggregate_report', END) as StateGraph<any>;
}
