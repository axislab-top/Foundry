import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { CeoSupervisorAnnotation, type CeoSupervisorState } from './ceo-state.js';
import { buildDirectorTaskSubGraph } from './build-director-task-subgraph.js';
import { buildEmployeeTaskSubGraph } from './build-employee-task-subgraph.js';
import { buildL2CrossDepartmentGraph } from './build-l2-cross-department-graph.js';
import type {
  BuildHierarchicalHeartbeatGraphOptions,
  EarlyExitDecision,
  HierarchicalExpandHandler,
} from './types.js';

/**
 * 注册可在 `hierarchicalExpand` 之后按 plan 字段 `dynamicSubGraphNodeIds` 运行时编译并 invoke 的子图。
 * Plan JSON 由 CEO LLM / Worker 填充；未设置时行为与仅执行 inner 完全一致。
 */
export class HierarchicalHeartbeatDynamicSubGraphRegistry {
  private readonly builders = new Map<string, (ctx: CeoSupervisorState) => StateGraph<any>>();
  private earlyExitHandler?: (state: CeoSupervisorState) => Promise<EarlyExitDecision | null>;

  addDynamicSubGraph(nodeId: string, subGraphBuilder: (ctx: CeoSupervisorState) => StateGraph<any>): void {
    this.builders.set(String(nodeId ?? '').trim(), subGraphBuilder);
  }

  /**
   * W9：注册 `director_autonomous` 节点对应的 director-task-graph（plan→assign→execute→report）。
   * 可被 CEO `dynamicSubGraphNodeIds` 引用，也可由部门路径 {@link invokeStandaloneSubGraph} 单独执行。
   */
  registerDirectorSubGraph(
    subGraphBuilder?: (ctx: CeoSupervisorState) => StateGraph<any>,
  ): void {
    const build = subGraphBuilder ?? ((_ctx: CeoSupervisorState) => buildDirectorTaskSubGraph());
    this.addDynamicSubGraph('director_autonomous', build);
  }

  /**
   * W10：注册 `employee_autonomous` → quick-execute→report 子图。
   */
  registerEmployeeSubGraph(
    subGraphBuilder?: (ctx: CeoSupervisorState) => StateGraph<any>,
  ): void {
    const build = subGraphBuilder ?? ((_ctx: CeoSupervisorState) => buildEmployeeTaskSubGraph());
    this.addDynamicSubGraph('employee_autonomous', build);
  }

  /**
   * W11：注册 `l2_cross_department`（detect → route → parallel Director/Employee → aggregate）。
   */
  registerL2CrossDeptGraph(): void {
    this.addDynamicSubGraph('l2_cross_department', () =>
      buildL2CrossDepartmentGraph({
        runParallelSubgraphs: (state, ids) => this.invokeStandaloneSubGraphsParallel(ids, state),
      }),
    );
  }

  /**
   * Phase 3.5：注册 Early-Exit 决策（plan 完成后由 Worker 调用 {@link invokeEarlyExitDecide}），
   * 并挂载 `early_exit_decider` 动态子图 id（与 `dynamicSubGraphNodeIds` 机制对齐）。
   */
  registerEarlyExitDecider(handler: (state: CeoSupervisorState) => Promise<EarlyExitDecision | null>): void {
    this.earlyExitHandler = handler;
    const registry = this;
    this.addDynamicSubGraph('early_exit_decider', (_ctx: CeoSupervisorState) => {
      const n = 'early_exit_decider_run';
      const g = new StateGraph(CeoSupervisorAnnotation)
        .addNode(n, async (st: CeoSupervisorState) => {
          const d = await registry.invokeEarlyExitDecide(st);
          const can = Boolean(d?.canEarlyExit);
          const conf = typeof d?.confidence === 'number' && Number.isFinite(d.confidence) ? d.confidence : 0;
          const reply = typeof d?.suggestedReply === 'string' ? d.suggestedReply : '';
          return {
            earlyExitJson: JSON.stringify({
              earlyExit: can,
              confidence: conf,
              suggestedReplyPreview: reply.slice(0, 200),
            }),
            ...(can && reply.trim() ? { reportDraft: reply.trim() } : {}),
          };
        })
        .addEdge(START, n)
        .addEdge(n, END);
      return g as StateGraph<any>;
    });
  }

  async invokeEarlyExitDecide(state: CeoSupervisorState): Promise<EarlyExitDecision | null> {
    if (!this.earlyExitHandler) return null;
    return this.earlyExitHandler(state);
  }

  /**
   * W10：并行 invoke 多个动态子图；各自独立 checkpoint thread。
   */
  async invokeStandaloneSubGraphsParallel(
    nodeIds: string[],
    baseState: CeoSupervisorState,
  ): Promise<Array<Partial<CeoSupervisorState> | null>> {
    const unique = [...new Set(nodeIds.map((x) => String(x ?? '').trim()).filter(Boolean))].slice(0, 6);
    const bundleBase = (() => {
      try {
        return JSON.parse(String(baseState.contextBundle || '{}')) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();
    return Promise.all(
      unique.map((id) => {
        const contextBundle = JSON.stringify({ ...bundleBase, parallelSubGraphId: id });
        return this.invokeStandaloneSubGraph(id, {
          ...baseState,
          traceId: `${baseState.traceId}:multi:${id}`,
          supervisorRunId: `${baseState.supervisorRunId}:multi:${id}`,
          contextBundle,
        });
      }),
    );
  }

  async invokeStandaloneSubGraph(
    nodeId: string,
    state: CeoSupervisorState,
  ): Promise<Partial<CeoSupervisorState> | null> {
    const id = String(nodeId ?? '').trim();
    const builder = this.builders.get(id);
    if (!builder) return null;
    try {
      const sub = builder(state);
      const compiled = sub.compile({ checkpointer: new MemorySaver() });
      const out = await compiled.invoke(state, {
        configurable: { thread_id: `${state.traceId}:standalone-sub:${id}` },
      });
      return out as Partial<CeoSupervisorState>;
    } catch {
      return null;
    }
  }

  /**
   * 包装既有 `hierarchicalExpand`：先执行 inner，再按需编译子图（独立 MemorySaver checkpoint）。
   */
  wrapHierarchicalExpand(
    inner: HierarchicalExpandHandler,
    opts?: {
      shouldRunDynamic?: (merged: CeoSupervisorState) => Promise<boolean>;
      onSubgraphInvoked?: (count: number, nodeIds: string[]) => void;
      /** W7：Director/Employee 动态子图并行 invoke（仍受 targets 上限约束） */
      parallelDynamicSubgraphs?: boolean;
    },
  ): HierarchicalExpandHandler {
    return async (state: CeoSupervisorState): Promise<Partial<CeoSupervisorState>> => {
      const innerOut = await inner(state);
      const merged: CeoSupervisorState = { ...state, ...innerOut } as CeoSupervisorState;
      if (opts?.shouldRunDynamic && !(await opts.shouldRunDynamic(merged))) {
        return innerOut;
      }
      const planSrc = merged.planResultJson || '{}';
      let targets: string[] = [];
      try {
        const p = JSON.parse(planSrc) as { dynamicSubGraphNodeIds?: unknown };
        if (Array.isArray(p?.dynamicSubGraphNodeIds)) {
          targets = p.dynamicSubGraphNodeIds
            .map((x) => String(x ?? '').trim())
            .filter(Boolean)
            .slice(0, 8);
        }
      } catch {
        targets = [];
      }

      let invoked = 0;

      const runOne = async (id: string) => {
        const builder = this.builders.get(id);
        if (!builder) return 0;
        try {
          const sub = builder(merged);
          const compiled = sub.compile({ checkpointer: new MemorySaver() });
          await compiled.invoke(merged, {
            configurable: { thread_id: `${state.traceId}:hierarchical-sub:${id}` },
          });
          return 1;
        } catch {
          return 0;
        }
      };

      if (opts?.parallelDynamicSubgraphs && targets.length > 1) {
        const results = await Promise.all(targets.map((id) => runOne(id)));
        invoked = results.reduce<number>((a, b) => a + b, 0);
      } else {
        for (const id of targets) {
          invoked += await runOne(id);
        }
      }
      opts?.onSubgraphInvoked?.(invoked, targets);

      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(String(innerOut.hierarchicalMetaJson ?? state.hierarchicalMetaJson ?? '{}')) as Record<
          string,
          unknown
        >;
      } catch {
        meta = {};
      }
      meta.dynamicSubGraphInvocations = invoked;
      meta.dynamicSubGraphTargets = targets;
      return {
        ...innerOut,
        hierarchicalMetaJson: JSON.stringify(meta),
      };
    };
  }
}

/**
 * 层级自治流水线：ingest → plan → hierarchicalExpand → validatePersist → summarize → notify。
 */
export function buildHierarchicalHeartbeatGraph(options: BuildHierarchicalHeartbeatGraphOptions) {
  const checkpointer = options.checkpointer ?? new MemorySaver();

  const ingestNode = async (state: typeof CeoSupervisorAnnotation.State) => options.ingest(state);
  const planNode = async (state: typeof CeoSupervisorAnnotation.State) => options.plan(state);
  const hierarchicalExpandNode = async (state: typeof CeoSupervisorAnnotation.State) =>
    options.hierarchicalExpand(state);
  const validatePersistNode = async (state: typeof CeoSupervisorAnnotation.State) =>
    options.validatePersist(state);
  const summarizeNode = async (state: typeof CeoSupervisorAnnotation.State) => options.summarize(state);
  const notifyNode = async (state: typeof CeoSupervisorAnnotation.State) => options.notify(state);

  return new StateGraph(CeoSupervisorAnnotation)
    .addNode('ingest', ingestNode)
    .addNode('plan', planNode)
    .addNode('hierarchicalExpand', hierarchicalExpandNode)
    .addNode('validatePersist', validatePersistNode)
    .addNode('summarize', summarizeNode)
    .addNode('notify', notifyNode)
    .addEdge(START, 'ingest')
    .addEdge('ingest', 'plan')
    .addEdge('plan', 'hierarchicalExpand')
    .addEdge('hierarchicalExpand', 'validatePersist')
    .addEdge('validatePersist', 'summarize')
    .addEdge('summarize', 'notify')
    .addEdge('notify', END)
    .compile({ checkpointer });
}
