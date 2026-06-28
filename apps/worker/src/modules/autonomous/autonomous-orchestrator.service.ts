import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { createHash, randomUUID } from 'crypto';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';
import {
  buildHierarchicalHeartbeatGraph,
  CeoSupervisorAnnotation,
  HierarchicalHeartbeatDynamicSubGraphRegistry,
  ToolRegistry,
  type CeoSupervisorState,
  type HierarchicalExpandHandler,
} from '@service/ai';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { TenantContextService } from '@service/tenant';
import { MessagingService } from '@service/messaging';
import type {
  AutonomousCeoApprovalRequiredEvent,
  AutonomousCeoHeartbeatCompletedEvent,
  BillingConsumptionRequestedEvent,
  CollaborationHeartbeatCorrelationPayload,
  SkillToolSnapshot,
  TaskBreakdownRequestedEvent,
} from '@contracts/events';
import { metrics, trace, SpanStatusCode } from '@opentelemetry/api';
import type { ZodIssue, ZodSchema } from 'zod';
import { ConfigService } from '../../common/config/config.service.js';
import { CeoChatModelFactory } from './ceo-chat-model.factory.js';
import {
  CEO_PLAN_DEFAULT_SUMMARY,
  ceoPlanIntentSchema,
  ceoPlanSchema,
  ceoPlanTasksExpansionSchema,
  type CeoPlanOutput,
} from './ceo-plan.schema.js';
import { CollaborationPipelineV2Service } from '../collaboration/pipeline-v2/collaboration-pipeline-v2.service.js';
import {
  collectOrganizationNodeIds,
  compactOrgTreeForPrompt,
  type OrgTreeNodeShape,
} from './org-tree.util.js';
import { AutonomousCheckpointService } from './autonomous-checkpoint.service.js';
import { LlmKeyResolverService } from './llm-key-resolver.service.js';
import { RpcMemoryAdapter } from './memory-port.js';
import {
  beginCeoPipelineRpc,
  endCeoPipelineRpc,
  resolveCeoPipelineRpcTier,
} from './ceo-pipeline-rpc-context.js';
import { WorkerExecutionLogService } from '../../common/observability/worker-execution-log.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';
import { COLLAB_LLM_TRACE, safeLlmBaseUrlForLog } from '../../common/logging/collab-llm-trace.util.js';
import { ConversationOutputSanitizerService } from '../collaboration/conversation-output-sanitizer.service.js';
import { CeoLayerConfigResolverService } from '../collaboration/ceo/resolver/ceo-layer-config-resolver.service.js';
import { ResiliencePolicyService } from '../../common/resilience/resilience-policy.service.js';
import { DegradationPolicyService } from '../collaboration/degradation/degradation-policy.service.js';
import { L1FeatureFlagService } from '../collaboration/l1/l1-feature-flag.service.js';
import { memoryReferencesFromSearchHits } from '../collaboration/utils/memory-references-from-hits.util.js';
import { CostAwareRouterService } from '../billing/cost-aware-router.service.js';
import { CeoEarlyExitDeciderService } from './ceo-early-exit-decider.service.js';
import { CollaborationSessionLeaseService } from '../collaboration/session/collaboration-session-lease.service.js';
import { CompanyExecutionCoordinationService } from '../../common/coordination/company-execution-coordination.service.js';
import {
  ensureJsonKeywordForStructuredOutput,
  isJsonObjectPromptFormatError,
  readBreakdownContextFromState,
  structuredOutputMethodForCeoPlan,
} from './ceo-structured-output.util.js';

export interface RunHeartbeatOptions {
  triggerSource?: 'schedule' | 'task_completed' | 'budget_warning' | 'collaboration_mention';
  triggerRef?: string;
  traceId?: string;
  /** 协作消息触发的房间：notify 优先发往此房间 */
  collaborationRoomId?: string;
  breakdownContext?: Record<string, unknown>;
}

/**
 * LangChain 对「非 gpt-3 / 非 gpt-4-* / 非 gpt-4」模型名默认走 response_format=json_schema。
 * 智谱 GLM、DeepSeek 等 OpenAI 兼容网关往往不支持或长时间挂起，应使用 json_mode。
 * @see structuredOutputMethodForCeoPlan in ceo-structured-output.util.ts
 */

@Injectable()
export class AutonomousOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(AutonomousOrchestratorService.name);
  private graph!: ReturnType<typeof buildHierarchicalHeartbeatGraph>;
  /** 群聊 @CEO 拆解：不用 Postgres checkpoint，避免 invoke 首帧读/写库卡住导致长时间无日志 */
  private graphBreakdown!: ReturnType<typeof buildHierarchicalHeartbeatGraph>;
  private readonly ceoAgentIdCache = new Map<string, { agentId: string; expiresAt: number }>();
  /**
   * 规划「可恢复」失败 streak（24h 滑动窗口）。用于抬高 HITL：仅连续 ≥3 次或模型级错误才强制审批。
   */
  private readonly ceoPlanSoftFailureStreak = new Map<
    string,
    { count: number; windowStartMs: number }
  >();
  private static readonly CEO_PLAN_SOFT_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;
  private static readonly TASK_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
  private readonly graphMeter = metrics.getMeter('foundry.graph');
  private readonly graphSubgraphCount = this.graphMeter.createCounter('foundry.graph.subgraph.count');

  constructor(
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    /** 与协作监听器同源队列；CEO plan 里预算/密钥等短 RPC 走此通道，避免排在 api-rpc-autonomous 长队后 */
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpcInteractive: ClientProxy,
    private readonly config: ConfigService,
    private readonly messaging: MessagingService,
    private readonly chatFactory: CeoChatModelFactory,
    private readonly llmKeyResolver: LlmKeyResolverService,
    private readonly checkpoints: AutonomousCheckpointService,
    private readonly memoryPort: RpcMemoryAdapter,
    private readonly executionLog: WorkerExecutionLogService,
    private readonly registry: ToolRegistry,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
    private readonly resilience: ResiliencePolicyService,
    private readonly degradationPolicy: DegradationPolicyService,
    private readonly collabPipelineV2: CollaborationPipelineV2Service,
    private readonly l1FeatureFlags: L1FeatureFlagService,
    private readonly costAwareRouter: CostAwareRouterService,
    /** CEO 心跳图中 `hierarchicalExpand` 的动态子图注册表（单例，可经模块 export 扩展）。 */
    private readonly hierarchicalSubGraphRegistry: HierarchicalHeartbeatDynamicSubGraphRegistry,
    private readonly ceoEarlyExitDecider: CeoEarlyExitDeciderService,
    private readonly executionCoordination: CompanyExecutionCoordinationService,
    @Optional() private readonly monitoring?: MonitoringService,
    @Optional() private readonly collabSessionLease?: CollaborationSessionLeaseService,
  ) {}

  onModuleInit(): void {
    this.registerW7DynamicSubgraphs();
    this.hierarchicalSubGraphRegistry.registerEarlyExitDecider((s) => this.ceoEarlyExitDecider.decide(s));
    let hierarchicalExpandHandler: HierarchicalExpandHandler = (s) => this.hierarchicalExpand(s);
    if (this.config.isMultiAgentGraphV2Enabled()) {
      hierarchicalExpandHandler = this.hierarchicalSubGraphRegistry.wrapHierarchicalExpand(
        hierarchicalExpandHandler,
        {
          shouldRunDynamic: async (merged) =>
            this.config.isMultiAgentGraphV2Enabled() &&
            (await this.l1FeatureFlags.isMultiAgentGraphV2Effective(merged.companyId)),
          onSubgraphInvoked: (n) => this.graphSubgraphCount.add(n),
          parallelDynamicSubgraphs:
            this.config.isMultiAgentGraphV2Enabled() &&
            (this.config.isDirectorAutonomousEnabled() || this.config.isEmployeeAutonomousEnabled()),
        },
      );
    }
    if (this.config.isMultiAgentGraphV2Enabled() && this.config.isCrossDepartmentCoordinationEnabled()) {
      hierarchicalExpandHandler = this.wrapHierarchicalExpandWithL2Coordination(hierarchicalExpandHandler);
    }
    const handlers = {
      ingest: (s: CeoSupervisorState) => this.ingest(s),
      plan: (s: CeoSupervisorState) => this.planWithEarlyExitDecider(s),
      hierarchicalExpand: hierarchicalExpandHandler,
      validatePersist: (s: CeoSupervisorState) => this.validatePersist(s),
      summarize: (s: CeoSupervisorState) => this.summarize(s),
      notify: (s: CeoSupervisorState) => this.notify(s),
    };
    this.graph = buildHierarchicalHeartbeatGraph({
      checkpointer: this.checkpoints.getCheckpointer(),
      ...handlers,
    });
    this.graphBreakdown = buildHierarchicalHeartbeatGraph({
      checkpointer: new MemorySaver() as BaseCheckpointSaver,
      ...handlers,
    });
    this.logger.log('CEO LangGraph compiled', {
      heartbeatCheckpointer: this.config.getWorkerCheckpointDatabaseUrl() ? 'postgres' : 'memory',
      breakdownCheckpointer: 'memory-only',
    });
  }

  /**
   * W7：注册 `director_autonomous` / `employee_autonomous` 占位子图，供 plan JSON `dynamicSubGraphNodeIds` 引用。
   */
  private registerW7DynamicSubgraphs(): void {
    if (!this.config.isMultiAgentGraphV2Enabled()) return;

    const passthrough = (label: string) => (_ctx: CeoSupervisorState) => {
      const n = `${label}_noop`;
      const g = new StateGraph(CeoSupervisorAnnotation)
        .addNode(n, async () => ({}))
        .addEdge(START, n)
        .addEdge(n, END);
      return g as any;
    };

    // W9：Graph V2 + Director 自主双开时注册真实 director-task-graph；否则保持 CEO 主路径兼容的 noop。
    if (this.config.isDirectorAutonomousEnabled()) {
      this.hierarchicalSubGraphRegistry.registerDirectorSubGraph();
    } else {
      this.hierarchicalSubGraphRegistry.addDynamicSubGraph('director_autonomous', passthrough('director_autonomous'));
    }
    // W10：Graph V2 + 员工自主双开时注册真实 employee 子图。
    if (this.config.isEmployeeAutonomousEnabled()) {
      this.hierarchicalSubGraphRegistry.registerEmployeeSubGraph();
    } else {
      this.hierarchicalSubGraphRegistry.addDynamicSubGraph('employee_autonomous', passthrough('employee_autonomous'));
    }

    if (this.config.isCrossDepartmentCoordinationEnabled()) {
      this.hierarchicalSubGraphRegistry.registerL2CrossDeptGraph();
    } else {
      this.hierarchicalSubGraphRegistry.addDynamicSubGraph('l2_cross_department', passthrough('l2_cross_department'));
    }
  }

  /**
   * W11：CEO plan 显式 `crossDepartmentL2: true` 时，在 hierarchicalExpand 动态子图之后追加 L2 跨部门图（零 breaking：默认不触发）。
   */
  private wrapHierarchicalExpandWithL2Coordination(inner: HierarchicalExpandHandler): HierarchicalExpandHandler {
    return async (state: CeoSupervisorState): Promise<Partial<CeoSupervisorState>> => {
      const out = await inner(state);
      if (!this.config.isMultiAgentGraphV2Enabled() || !this.config.isCrossDepartmentCoordinationEnabled()) {
        return out;
      }
      const merged: CeoSupervisorState = { ...state, ...out } as CeoSupervisorState;
      if (!(await this.l1FeatureFlags.isCrossDepartmentCoordinationEffective(merged.companyId))) {
        return out;
      }
      let plan: Record<string, unknown> = {};
      try {
        plan = JSON.parse(merged.planResultJson || '{}') as Record<string, unknown>;
      } catch {
        plan = {};
      }
      if (plan.crossDepartmentL2 !== true) {
        return out;
      }
      const nodeIds = Array.isArray(plan.crossDepartmentTargetNodeIds)
        ? (plan.crossDepartmentTargetNodeIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
      const l2Out = await this.hierarchicalSubGraphRegistry.invokeStandaloneSubGraph('l2_cross_department', {
        ...merged,
        contextBundle: JSON.stringify({
          crossDepartmentSignal: true,
          contentPreview: String(merged.goal ?? '').slice(0, 800),
          targetDepartmentNodeIds: nodeIds,
          l2ParallelSubGraphIds: ['director_autonomous', 'employee_autonomous'],
        }),
      });
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(String(out.hierarchicalMetaJson ?? state.hierarchicalMetaJson ?? '{}')) as Record<
          string,
          unknown
        >;
      } catch {
        meta = {};
      }
      meta.l2CrossDepartmentOrchestratorHook = l2Out?.hierarchicalMetaJson ?? null;
      return {
        ...out,
        hierarchicalMetaJson: JSON.stringify(meta),
        reportDraft: String(l2Out?.reportDraft ?? out.reportDraft ?? merged.reportDraft ?? ''),
      };
    };
  }

  private actor() {
    return {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
  }

  private baseState(
    companyId: string,
    tickAt: string,
    runKind: 'heartbeat' | 'breakdown' | 'graph',
    goal: string,
    rootTaskId: string | undefined,
    opts?: RunHeartbeatOptions,
  ): CeoSupervisorState {
    const traceId = opts?.traceId ?? randomUUID();
    const supervisorRunId = traceId;
    return {
      companyId,
      tickAt,
      runKind,
      goal,
      rootTaskId,
      traceId,
      supervisorRunId,
      triggerSource: opts?.triggerSource ?? 'schedule',
      triggerRef: opts?.triggerRef ?? '',
      contextBundle: '',
      planResultJson: '{}',
      createdTaskIdsJson: '[]',
      persistErrorsJson: '[]',
      llmMetaJson: '{}',
      skipPlanReason: '',
      hierarchicalMetaJson: JSON.stringify({
        breakdownContext: opts?.breakdownContext ?? {},
      }),
      mainRoomId: '',
      ceoAgentId: '',
      collaborationRoomId: opts?.collaborationRoomId?.trim() ?? '',
      reportDraft: '',
      earlyExitJson: '{}',
    };
  }

  private readEarlyExitSnapshot(state: CeoSupervisorState): {
    earlyExit: boolean;
    layerStoppedAt?: number;
    confidence?: number;
  } {
    try {
      const j = JSON.parse(state.earlyExitJson || '{}') as {
        earlyExit?: boolean;
        layerStoppedAt?: number;
        confidence?: number;
      };
      return {
        earlyExit: j.earlyExit === true,
        layerStoppedAt: typeof j.layerStoppedAt === 'number' ? j.layerStoppedAt : undefined,
        confidence: typeof j.confidence === 'number' ? j.confidence : undefined,
      };
    } catch {
      return { earlyExit: false };
    }
  }

  /**
   * Phase 3.5：Layer1(plan) 完成后运行 Early-Exit 仲裁；命中则写入 earlyExitJson + reportDraft，后续节点短路。
   */
  private async planWithEarlyExitDecider(state: CeoSupervisorState): Promise<Partial<CeoSupervisorState>> {
    const earlyExitPhaseStartedAt = Date.now();
    const out = await this.plan(state);
    if (!this.config.isCeoEarlyExitEnabled()) {
      return out;
    }
    if (out.skipPlanReason) {
      return out;
    }
    const merged = { ...state, ...out } as CeoSupervisorState;
    const decision = await this.hierarchicalSubGraphRegistry.invokeEarlyExitDecide(merged);
    const th = this.config.getEarlyExitConfidenceThreshold();
    const conf =
      decision != null && typeof decision.confidence === 'number' && Number.isFinite(decision.confidence)
        ? decision.confidence
        : 0;
    const reply = (decision?.suggestedReply ?? '').trim();
    const eligible =
      decision != null && Boolean(decision.canEarlyExit) && conf > th && reply.length > 0;
    const span = trace.getActiveSpan();
    if (eligible) {
      span?.setAttribute('foundry.ceo.early_exit', 'hit');
      span?.setAttribute('foundry.ceo.early_exit.confidence', conf);
      span?.setAttribute('foundry.ceo.layer_stopped_at', 1);
      this.monitoring?.recordCeoEarlyExitDecision('hit');
      this.logger.log('foundry.ceo.early_exit.decision', {
        outcome: 'hit',
        earlyExit: true,
        layerStoppedAt: 1,
        confidence: conf,
        routeTag: decision?.routeTag ?? 'autonomous_graph',
        reason: decision?.reason,
        elapsedMsBeforeExit: Date.now() - earlyExitPhaseStartedAt,
        traceId: state.traceId,
        companyId: state.companyId,
        runKind: state.runKind,
      });
      return {
        ...out,
        reportDraft: reply,
        earlyExitJson: JSON.stringify({
          earlyExit: true,
          layerStoppedAt: 1,
          confidence: conf,
        }),
      };
    }
    span?.setAttribute('foundry.ceo.early_exit', 'miss');
    span?.setAttribute('foundry.ceo.early_exit.confidence', conf);
    this.monitoring?.recordCeoEarlyExitDecision('miss');
    this.logger.log('foundry.ceo.early_exit.decision', {
      outcome: 'miss',
      earlyExit: false,
      confidence: conf,
      routeTag: decision?.routeTag ?? 'none',
      reason: decision?.reason,
      elapsedMsBeforeExit: Date.now() - earlyExitPhaseStartedAt,
      traceId: state.traceId,
      companyId: state.companyId,
      runKind: state.runKind,
    });
    return {
      ...out,
      earlyExitJson: JSON.stringify({
        earlyExit: false,
        confidence: conf,
      }),
    };
  }

  async runHeartbeat(
    companyId: string,
    tickAt: string,
    opts?: RunHeartbeatOptions,
  ): Promise<void> {
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      if (this.collabSessionLease && (await this.collabSessionLease.isHeavyCollaborationLeaseActive(companyId))) {
        this.logger.log('foundry.ceo.heartbeat.deferred_collab_session_lease', {
          companyId,
          triggerSource: opts?.triggerSource ?? 'schedule',
          triggerRef: opts?.triggerRef ?? null,
        });
        return;
      }
      await this.invokeGraph(this.baseState(companyId, tickAt, 'heartbeat', '', undefined, opts));
    });
  }

  /**
   * W5：`runKind=graph` 时使用与心跳相同的持久化 LangGraph（非 breakdown 内存图）。
   */
  async runGraph(companyId: string, tickAt: string, opts?: RunHeartbeatOptions): Promise<void> {
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      await this.invokeGraph(this.baseState(companyId, tickAt, 'graph', '', undefined, opts));
    });
  }

  async runBreakdown(event: TaskBreakdownRequestedEvent): Promise<void> {
    const companyId = event.data.companyId;
    const tickAt = event.data.requestedAt;
    const ctx = event.data.context;
    const collaborationRoomId =
      ctx && typeof ctx.roomId === 'string' && ctx.roomId.trim() ? ctx.roomId.trim() : '';
    const triggerRef =
      ctx && typeof ctx.sourceMessageId === 'string' && ctx.sourceMessageId.trim()
        ? ctx.sourceMessageId.trim()
        : '';
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      await this.invokeGraph(
        this.baseState(companyId, tickAt, 'breakdown', event.data.goal, event.data.rootTaskId, {
          /** 无 room 的 breakdown（如后台触发）仍标为 schedule，避免误走 interactive 队列 */
          triggerSource: collaborationRoomId ? 'collaboration_mention' : 'schedule',
          triggerRef,
          collaborationRoomId,
          breakdownContext: {
            ...(ctx && typeof ctx === 'object' ? (ctx as Record<string, unknown>) : {}),
          },
        }),
      );
    });
  }

  private async invokeGraph(initial: CeoSupervisorState): Promise<void> {
    const ran = await this.executionCoordination.withCeoGraphLock(initial.companyId, async () => {
      await this.invokeGraphInner(initial);
    });
    if (ran === undefined) {
      this.logger.log('CEO graph skipped: company graph lock contention', {
        companyId: initial.companyId,
        traceId: initial.traceId,
        runKind: initial.runKind,
        triggerSource: initial.triggerSource,
      });
    }
  }

  private async invokeGraphInner(initial: CeoSupervisorState): Promise<void> {
    const rpcTier =
      initial.runKind === 'breakdown' && initial.triggerSource === 'collaboration_mention'
        ? 'interactive'
        : 'default';

    beginCeoPipelineRpc(initial.traceId, rpcTier);
    const recordHeartbeatRun = initial.runKind === 'heartbeat';
    try {
      const threadId = `ceo:${initial.companyId}:${initial.runKind}:${initial.traceId}`;
      const useBreakdownGraph = initial.runKind === 'breakdown';
      const graph = useBreakdownGraph ? this.graphBreakdown : this.graph;
      this.logger.log('CEO graph invoke', {
        companyId: initial.companyId,
        traceId: initial.traceId,
        triggerSource: initial.triggerSource,
        threadId,
        checkpointerMode: useBreakdownGraph ? 'memory (breakdown fast path)' : 'persisted',
        apiRpcTier: resolveCeoPipelineRpcTier(initial.traceId),
      });

      // Cycle start prewarm: fetch effective skill snapshots and hydrate ToolRegistry once,
      // so CEO tool availability is warm before any downstream execution/dispatch.
      await this.prewarmCeoTools(initial).catch((e) => {
        this.logger.warn('CEO tools prewarm failed (non-blocking)', {
          traceId: initial.traceId,
          companyId: initial.companyId,
          message: this.formatErrorMessage(e).slice(0, 800),
        });
      });

      if (recordHeartbeatRun) {
        await this.executionLog.appendForRun(initial.companyId, initial.traceId, {
          stepType: 'ceo.graph.start',
          traceId: initial.traceId,
          message: `${initial.triggerSource}:invoke`,
        });
      }
      const tracer = trace.getTracer('foundry-worker-autonomous');
      let out: Awaited<ReturnType<typeof graph.invoke>>;
      try {
        out = await tracer.startActiveSpan('ceo.langgraph.invoke', async (span) => {
          span.setAttribute('foundry.company_id', initial.companyId);
          span.setAttribute('foundry.correlation_trace_id', initial.traceId);
          span.setAttribute('foundry.thread_id', threadId);
          span.setAttribute('foundry.run_kind', initial.runKind);
          span.setAttribute('gen_ai.operation.name', 'ceo_heartbeat_graph');
          try {
            // P8：本图不直接执行 shell；若下游触发 Agent 技能，shell 仅经 AgentExecutionService → RunnerExecutionClient
            const result = await graph.invoke(initial, {
              configurable: { thread_id: threadId },
            });
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            span.setStatus({ code: SpanStatusCode.ERROR, message: msg.slice(0, 240) });
            throw e;
          }
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error('CEO graph.invoke failed', {
          traceId: initial.traceId,
          threadId,
          checkpointerMode: useBreakdownGraph ? 'memory' : 'persisted',
          message: msg,
        });
        if (recordHeartbeatRun) {
          await this.executionLog.appendForRun(initial.companyId, initial.traceId, {
            stepType: 'ceo.graph.error',
            traceId: initial.traceId,
            message: msg.slice(0, 2000),
            outputSnapshot: { error: msg.slice(0, 1500), threadId },
          });
        }
        throw e;
      }
      this.logger.log('CEO graph completed', {
        companyId: initial.companyId,
        runKind: initial.runKind,
        threadId,
        reportPreview: out.reportDraft?.slice(0, 200),
      });

      const preview = (out.reportDraft ?? '').slice(0, 2000);
      if (recordHeartbeatRun) {
        await this.executionLog.appendForRun(initial.companyId, initial.traceId, {
          stepType: 'ceo.graph.complete',
          traceId: initial.traceId,
          message: 'ok',
          outputSnapshot: { reportPreview: preview.slice(0, 800), threadId },
        });
      }
      const outRec = out as Record<string, unknown>;
      const graphMainRoomId = typeof outRec.mainRoomId === 'string' ? outRec.mainRoomId.trim() : '';
      let heartbeatCorrelation: CollaborationHeartbeatCorrelationPayload | undefined;
      if (this.config.isCollabHeartbeatCorrelationEnabled()) {
        const collabRoom = initial.collaborationRoomId?.trim() ?? '';
        const surface = collabRoom || graphMainRoomId;
        heartbeatCorrelation = {
          heartbeatRunId: initial.traceId,
          tickAt: initial.tickAt,
          triggerSource: initial.triggerSource,
          runKind: initial.runKind,
          mainRoomId: graphMainRoomId || null,
          collaborationSurfaceRoomId: surface || null,
        };
      }
      const completed: AutonomousCeoHeartbeatCompletedEvent = {
        eventId: randomUUID(),
        eventType: 'autonomous.ceo.heartbeat.completed',
        aggregateId: initial.companyId,
        aggregateType: 'company',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: initial.companyId,
        data: {
          companyId: initial.companyId,
          tickAt: initial.tickAt,
          runKind: initial.runKind,
          reportPreview: preview,
          threadId,
          ...(initial.runKind === 'heartbeat' ? { runId: initial.traceId } : {}),
          ...(heartbeatCorrelation ? { heartbeatCorrelation } : {}),
        },
      };
      await this.messaging.publish(completed, {
        routingKey: 'autonomous.ceo.heartbeat.completed',
        persistent: true,
      });
    } finally {
      endCeoPipelineRpc(initial.traceId);
    }
  }

  private rpcTimeoutHint(pattern: string, queue: string, clientLabel: string): string {
    return (
      `Timeout has occurred (${pattern}, ${clientLabel}). ` +
      `Often caused by backlog on queue "${queue}"; scale API consumers or drain the queue ` +
      `(see scripts/purge-api-rpc-queue.ps1 in dev).`
    );
  }

  private async rpcSend<T>(
    client: ClientProxy,
    pattern: string,
    payload: Record<string, unknown>,
    queueName: string,
    clientLabel: string,
  ): Promise<T> {
    try {
      return await firstValueFrom(
        client.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
    } catch (e: unknown) {
      if (e instanceof TimeoutError || (e as { name?: string })?.name === 'TimeoutError') {
        throw new Error(this.rpcTimeoutHint(pattern, queueName, clientLabel));
      }
      throw e;
    }
  }

  /** LangGraph 节点内调用：协作 @CEO breakdown 时按 traceId 绑定走 interactive 队列 */
  private async rpc<T>(pattern: string, payload: Record<string, unknown>, traceId: string): Promise<T> {
    const tier = resolveCeoPipelineRpcTier(traceId);
    if (tier === 'interactive') {
      return this.rpcSend(
        this.apiRpcInteractive,
        pattern,
        payload,
        this.config.getInteractiveApiRpcQueue(),
        'interactive',
      );
    }
    return this.rpcSend(
      this.apiRpc,
      pattern,
      payload,
      this.config.getApiRpcQueue(),
      'autonomous',
    );
  }

  /** 预算/密钥等：无论当前 tier 如何都走 interactive，避免排在 autonomous 长队后 */
  private async rpcInteractive<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return this.rpcSend(
      this.apiRpcInteractive,
      pattern,
      payload,
      this.config.getInteractiveApiRpcQueue(),
      'interactive',
    );
  }

  private isLikelyLlmTimeoutError(e: unknown): boolean {
    return /timed out|timeout|etimedout|socket hang up/i.test(this.formatErrorMessage(e));
  }

  private taskCountInIngestBundle(parsed: Record<string, unknown>, status: string): number {
    const t = parsed[`tasks_${status}`] as { items?: unknown[]; total?: number } | undefined;
    if (typeof t?.total === 'number') return t.total;
    return Array.isArray(t?.items) ? t.items.length : 0;
  }

  /**
   * GLM 等网关对长 body 约 150s 读超时；勿把整段 contextBundle JSON 塞进 user。
   */
  private buildGlmBreakdownSlimContextJson(
    state: CeoSupervisorState,
    parsed: Record<string, unknown>,
    orgTree: OrgTreeNodeShape[],
    mode: 'slim' | 'slimmer' | 'minimal',
  ): string {
    const orgFull = orgTree.length ? compactOrgTreeForPrompt(orgTree) : '';
    const orgSlice =
      mode === 'minimal' ? orgFull.slice(0, 380) : mode === 'slimmer' ? orgFull.slice(0, 720) : orgFull.slice(0, 1100);

    const dashRaw = parsed.dashboard;
    const dashStr =
      dashRaw == null ? '' : typeof dashRaw === 'string' ? dashRaw : JSON.stringify(dashRaw);
    const dashSlice =
      mode === 'minimal' ? dashStr.slice(0, 140) : mode === 'slimmer' ? dashStr.slice(0, 220) : dashStr.slice(0, 360);

    const mem = parsed.memorySearch;
    const memArr = Array.isArray(mem) ? mem : [];
    const memPreview =
      mode === 'minimal'
        ? undefined
        : memArr
            .slice(0, mode === 'slimmer' ? 1 : 2)
            .map((x: unknown) => {
              const s =
                x && typeof x === 'object' && x && 'snippet' in x
                  ? String((x as { snippet?: string }).snippet ?? '')
                  : '';
              const lim = mode === 'slimmer' ? 60 : 100;
              return s.slice(0, lim);
            })
            .filter(Boolean)
            .join(' | ');

    const sup = parsed.supervisorLessons;
    const supArr = Array.isArray(sup) ? sup : [];
    const lessonPreview =
      mode === 'minimal'
        ? undefined
        : supArr
            .slice(0, 2)
            .map((x: unknown) => {
              const s =
                x && typeof x === 'object' && x && 'snippet' in x
                  ? String((x as { snippet?: string }).snippet ?? '')
                  : '';
              const lim = mode === 'slimmer' ? 80 : 140;
              return s.slice(0, lim);
            })
            .filter(Boolean)
            .join(' | ');

    const router = parsed.modelRouter as { modelName?: string; utilization?: number; degraded?: boolean } | undefined;
    const budgetsRaw = parsed.budgets;
    const budgetsStr =
      budgetsRaw == null ? '' : typeof budgetsRaw === 'string' ? budgetsRaw : JSON.stringify(budgetsRaw);

    const payload: Record<string, unknown> = {
      companyId: state.companyId,
      rootTaskId: state.rootTaskId ?? null,
      dashboard: dashSlice || null,
      memoryHits: memArr.length,
      supervisorLessonHits: supArr.length,
      ...(memPreview ? { memoryPreview: memPreview } : {}),
      ...(lessonPreview ? { lessonPreview } : {}),
      taskCounts: {
        pending: this.taskCountInIngestBundle(parsed, 'pending'),
        in_progress: this.taskCountInIngestBundle(parsed, 'in_progress'),
        review: this.taskCountInIngestBundle(parsed, 'review'),
      },
      budgets: budgetsStr.slice(0, mode === 'minimal' ? 80 : mode === 'slimmer' ? 120 : 180),
      orgTree: orgSlice || '(无组织树)',
      routerModel: router?.modelName,
      routerUtil: router?.utilization,
      routerDegraded: router?.degraded,
    };

    if (mode !== 'minimal') {
      const pend = parsed.tasks_pending as { items?: { title?: string }[] } | undefined;
      const firstTitle = pend?.items?.[0]?.title;
      if (typeof firstTitle === 'string' && firstTitle.trim()) {
        payload.samplePendingTitle = firstTitle.trim().slice(0, 80);
      }
    }

    return JSON.stringify(payload);
  }

  private formatErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') {
      const rec = e as Record<string, unknown>;
      if (typeof rec.message === 'string') return rec.message;
      const response = rec.response;
      if (response && typeof response === 'object') {
        const msg = (response as Record<string, unknown>).message;
        if (typeof msg === 'string') return msg;
        if (Array.isArray(msg)) return msg.map((x) => String(x)).join('; ');
      }
      try {
        return JSON.stringify(e);
      } catch {
        return String(e);
      }
    }
    return String(e);
  }

  private clip(s: string, max: number): string {
    const t = (s ?? '').trim();
    if (!t) return '';
    return t.length <= max ? t : `${t.slice(0, max)}…`;
  }

  private isCeoPlanModelLevelFailure(message: string): boolean {
    const m = message.toLowerCase();
    return (
      /\b(401|403|429)\b/.test(m) ||
      /unauthorized|invalid.*api.*key|incorrect api key|authentication failed|access denied/i.test(m) ||
      /rate limit|too many requests|quota exceeded|insufficient[_\s]*quota/i.test(m) ||
      /model[_\s]*not[_\s]*found|invalid[_\s]*model|does not exist|unknown model/i.test(m) ||
      /billing.*block|payment required/i.test(m)
    );
  }

  private isRateLimitError(message: string): boolean {
    const m = (message || '').toLowerCase();
    return /\b429\b/.test(m) || /rate limit|too many requests|quota exceeded|insufficient[_\s]*quota/i.test(m);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }

  private planSingleFlightKey(state: CeoSupervisorState): string {
    return `autonomous:plan:single-flight:${state.companyId}:${state.runKind}`;
  }

  private planRateLimitCooldownKey(state: CeoSupervisorState): string {
    return `autonomous:plan:429-cooldown:${state.companyId}:${state.runKind}`;
  }

  private buildTaskIdempotencyKey(traceId: string, title: string, description: string, ordinal: number): string {
    const normalized = `${traceId}|${ordinal}|${title.trim().toLowerCase()}|${description.trim().toLowerCase()}`;
    const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 24);
    return `autonomous:task:${traceId}:${ordinal}:${hash}`;
  }

  private bumpCeoPlanSoftFailureStreak(companyId: string): number {
    const now = Date.now();
    const w = AutonomousOrchestratorService.CEO_PLAN_SOFT_FAILURE_WINDOW_MS;
    let rec = this.ceoPlanSoftFailureStreak.get(companyId);
    if (!rec || now - rec.windowStartMs > w) {
      rec = { count: 0, windowStartMs: now };
    }
    rec.count += 1;
    this.ceoPlanSoftFailureStreak.set(companyId, rec);
    return rec.count;
  }

  private resetCeoPlanSoftFailureStreak(companyId: string): void {
    this.ceoPlanSoftFailureStreak.delete(companyId);
  }

  private buildDynamicCeoApprovalReason(
    kind: string,
    technicalDetail: string,
    streak: number,
    modelFatal: boolean,
  ): string {
    const head = modelFatal
      ? '【模型/鉴权或配额】战略规划无法自动继续，需要人工确认环境与密钥。'
      : `【连续失败 ${streak} 次≥阈值】战略规划多次未能自动完成，需要人工确认是否继续自动拆解。`;
    // Keep user-facing approval reason concise; detailed diagnostics stay in worker logs.
    return `${head}（阶段: ${kind}）`;
  }

  private async maybeStructuredLightFallbackAfterPlanFailure(
    state: CeoSupervisorState,
    _detail: string,
  ): Promise<void> {
    if (state.runKind !== 'breakdown') return;
    const roomId = state.collaborationRoomId?.trim();
    const messageId = state.triggerRef?.trim();
    const ceoAgentId = state.ceoAgentId?.trim();
    const goal = (state.goal || '').trim();
    if (!roomId || !messageId || !ceoAgentId || !goal) {
      this.logger.debug('skip plan-failure light fallback: missing room/message/ceo/goal', {
        traceId: state.traceId,
      });
      return;
    }
    if (this.config.isGoalDraftAutoKickoffSilent()) {
      const src = await this.resolveBreakdownSourceTag(state.companyId, messageId, state.traceId);
      if (src === 'goal_draft_approved_auto_kickoff' || src === 'approval_resolved') {
        this.logger.log('skip light fallback for approved kickoff; keep heavy-only path', {
          traceId: state.traceId,
          companyId: state.companyId,
          messageId,
          source: src,
        });
        return;
      }
    }
    try {
      await this.collabPipelineV2.fastReply({
        companyId: state.companyId,
        roomId,
        ceoAgentId,
        sourceMessageId: messageId,
        threadId: null,
        userGoal: goal,
        traceId: state.traceId ?? null,
        reason: 'autonomous_plan_failure_fallback',
        heartbeatCorrelation: this.config.isCollabHeartbeatCorrelationEnabled()
          ? {
              heartbeatRunId: state.traceId,
              tickAt: state.tickAt,
              triggerSource: state.triggerSource,
              runKind: state.runKind,
              mainRoomId: null,
              collaborationSurfaceRoomId: roomId,
            }
          : undefined,
      });
    } catch (e: unknown) {
      this.logger.warn('structured light fallback after plan failure failed', {
        traceId: state.traceId,
        message: this.formatErrorMessage(e).slice(0, 400),
      });
    }
  }

  private async resolveBreakdownSourceTag(
    companyId: string,
    messageId: string,
    traceId: string,
  ): Promise<string | null> {
    const msg = await this.rpc<{ metadata?: Record<string, unknown> | null }>(
      'collaboration.messages.get',
      {
        companyId,
        actor: this.actor(),
        messageId,
      },
      traceId,
    ).catch(() => null as { metadata?: Record<string, unknown> | null } | null);
    const source = msg?.metadata && typeof msg.metadata.source === 'string' ? msg.metadata.source.trim() : '';
    return source || null;
  }

  private async maybeDiagnosticFallbackAfterPlanFailure(
    state: CeoSupervisorState,
    detail: string,
  ): Promise<void> {
    if (state.runKind !== 'breakdown') return;
    const roomId = state.collaborationRoomId?.trim();
    const messageId = state.triggerRef?.trim();
    const ceoAgentId = state.ceoAgentId?.trim();
    if (!roomId || !messageId || !ceoAgentId) return;
    if (this.config.isPostApprovalSilentModeEnabled()) {
      const src = await this.resolveBreakdownSourceTag(state.companyId, messageId, state.traceId);
      if (src === 'goal_draft_approved_auto_kickoff' || src === 'approval_resolved') {
        this.logger.log('skip diagnostic fallback for approved kickoff; silent wait for heavy retry', {
          traceId: state.traceId,
          companyId: state.companyId,
          messageId,
          source: src,
        });
        return;
      }
    }
    await this.rpc(
      'collaboration.messages.appendAgent',
      {
        companyId: state.companyId,
        actor: this.actor(),
        roomId,
        agentId: ceoAgentId,
        content: ConversationOutputSanitizerService.toVisibleLayer(
          '当前深度规划通道短暂波动，我已安全记录你的请求。你可以稍后重试，或让我先给出轻量结构化方案。',
        ),
        messageType: 'text',
        metadata: {
          source: 'autonomous_diagnostic_fallback',
          sourceMessageId: messageId,
          directReplyToMessageId: messageId,
          detailPreview: this.clip(detail, 200),
        },
      },
      state.traceId,
    ).catch(() => undefined);
  }

  private async finalizeCeoPlanSoftFailurePath(params: {
    state: CeoSupervisorState;
    technicalDetail: string;
    kind: 'intent_parse' | 'plan_exception';
    skipPlanReasonCode: string;
    friendlySummaryNoHitl: string;
    suppressHitl?: boolean;
  }): Promise<{ skipPlanReason: string; planResultJson: string; llmMetaJson: string }> {
    const { state, technicalDetail, kind, skipPlanReasonCode, friendlySummaryNoHitl, suppressHitl } = params;
    const modelFatal = this.isCeoPlanModelLevelFailure(technicalDetail);
    const streak = this.bumpCeoPlanSoftFailureStreak(state.companyId);
    const requireHitl = suppressHitl ? false : modelFatal || streak >= 3;
    const approvalReason = requireHitl
      ? this.buildDynamicCeoApprovalReason(kind, technicalDetail, streak, modelFatal)
      : undefined;

    const softSummary = requireHitl
      ? `战略规划自动化出现异常（当前 24h 内已连续失败 ${streak} 次${modelFatal ? '，且检测到模型/密钥侧错误' : ''}）。下方为系统摘要；审批原因中含具体技术摘要，与「询问 skills」等日常对话无必然关系。`
      : friendlySummaryNoHitl;

    const tasks: CeoPlanOutput['tasks'] = requireHitl
      ? [
          {
            title: '排查 CEO 自动规划并在恢复后重试本轮拆解',
            description: `此任务用于运维/Owner 排查，与「技能列表」或普通问答无必然关系。建议检查：LLM 密钥与模型可用性、公司预算/配额、网络稳定性。技术摘要：${this.clip(technicalDetail.replace(/\s+/g, ' ').trim(), 520)}`,
            priority: 'high',
          },
        ]
      : [];

    const fallback: CeoPlanOutput = {
      summary: softSummary,
      tasks,
      neededSkills: [],
      requiresHumanApproval: requireHitl,
      approvalReason,
    };

    if (!requireHitl) {
      const fallbackMessageId = (state.triggerRef || state.traceId || '').trim();
      const decision = this.degradationPolicy.decideFallback({
        flow: 'autonomous_plan',
        companyId: state.companyId,
        messageId: fallbackMessageId || state.traceId,
        traceId: state.traceId,
        errorMessage: technicalDetail,
        postApprovalSilent: this.config.isPostApprovalSilentModeEnabled()
          ? ['goal_draft_approved_auto_kickoff', 'approval_resolved'].includes(
              (await this.resolveBreakdownSourceTag(
                state.companyId,
                fallbackMessageId || state.traceId,
                state.traceId,
              )) ?? '',
            )
          : false,
      });
      if (decision?.nextMode === 'light') {
        await this.maybeStructuredLightFallbackAfterPlanFailure(state, technicalDetail);
      } else if (decision?.nextMode === 'diagnostic') {
        await this.maybeDiagnosticFallbackAfterPlanFailure(state, technicalDetail);
      }
    }

    this.logger.warn('CEO plan soft failure path', {
      traceId: state.traceId,
      companyId: state.companyId,
      kind,
      requireHitl,
      streak,
      modelFatal,
      detailPreview: this.clip(technicalDetail, 240),
      suppressHitl: Boolean(suppressHitl),
    });

    return {
      skipPlanReason: skipPlanReasonCode,
      planResultJson: JSON.stringify(fallback),
      llmMetaJson: JSON.stringify({
        error: true,
        stage: kind,
        planSoftDegraded: true,
        requireHitl,
        softFailureStreak: streak,
        modelFatal,
        rawDetail: this.clip(technicalDetail, 800),
      }),
    };
  }

  private parseCeoPlanUnsafe(raw: string | undefined): unknown {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }

  private parseCeoPlanWithGuard(raw: string | undefined, traceId: string, node: string): CeoPlanOutput {
    const parsed = this.parseCeoPlanUnsafe(raw);
    const checked = ceoPlanSchema.safeParse(parsed);
    if (checked.success) {
      return checked.data;
    }
    this.logger.warn('CEO plan schema parse failed; fallback defaults applied', {
      traceId,
      node,
      issues: checked.error.issues.map((i) => `${i.path.join('.') || 'root'}:${i.message}`).slice(0, 10),
    });
    this.monitoring?.incStructuredOutputParseFailure('ceo_heartbeat', node);
    return ceoPlanSchema.parse({
      summary: '计划输出格式异常，已降级为安全默认计划。',
      tasks: [],
      neededSkills: [],
      requiresHumanApproval: false,
    });
  }

  private renderZodIssues(issues: ZodIssue[]): string {
    return issues
      .slice(0, 12)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('\n');
  }

  private async repairStructuredOutputByLlm<T>(
    model: { invoke: (msgs: unknown[]) => Promise<unknown> },
    stage: 'intent' | 'tasks',
    schema: ZodSchema<T>,
    schemaHint: string,
    systemPrompt: string,
    userContent: string,
    malformed: unknown,
    issues: ZodIssue[],
    maxAttempts = 2,
    onAttempt?: (attempt: number) => void,
  ): Promise<T | null> {
    try {
      const issueText = this.renderZodIssues(issues);
      const repairPrompt = [
        '你是严格 JSON 修复器。',
        '你 MUST 只输出一个合法 JSON 对象，且不得输出 markdown、解释、代码块、前后缀。',
        `目标阶段: ${stage}`,
        '请依据 schema 约束和校验错误修复输出。',
        `Schema: ${schemaHint}`,
      ].join('\n');
      let currentMalformed = malformed;
      let currentIssues = issueText;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        this.monitoring?.incCeoPlanningRepairAttempt(stage);
        if (onAttempt) onAttempt(attempt);
        const repaired = await model.invoke([
          new SystemMessage(repairPrompt),
          new HumanMessage(
            [
              `original_system_prompt=${systemPrompt.slice(0, 2200)}`,
              `original_user_content=${userContent.slice(0, 3600)}`,
              `zod_issues=${currentIssues}`,
              `malformed_output=${JSON.stringify(currentMalformed).slice(0, 7000)}`,
              '请只返回修复后的 JSON 对象。',
            ].join('\n'),
          ),
        ]);
        const txt =
          typeof (repaired as any)?.content === 'string'
            ? (repaired as any).content
            : Array.isArray((repaired as any)?.content)
              ? (repaired as any).content
                  .map((x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x)))
                  .join('')
              : JSON.stringify((repaired as any)?.content ?? repaired);
        const match = txt.match(/\{[\s\S]*\}/);
        const candidate = this.parseCeoPlanUnsafe(match ? match[0] : txt);
        const checked = schema.safeParse(candidate);
        if (checked.success) return checked.data;
        currentMalformed = candidate;
        currentIssues = this.renderZodIssues(checked.error.issues);
      }
      return null;
    } catch {
      return null;
    }
  }

  private isMemoryNamespaceForbidden(e: unknown): boolean {
    return /无权检索记忆命名空间|MEMORY_NAMESPACE_FORBIDDEN/i.test(this.formatErrorMessage(e));
  }

  private async ingest(state: CeoSupervisorState): Promise<Partial<CeoSupervisorState>> {
    const ingestStarted = Date.now();
    const { companyId } = state;
    const actor = this.actor();
    this.logger.log('CEO ingest node entered', {
      companyId,
      traceId: state.traceId,
      runKind: state.runKind,
      triggerSource: state.triggerSource,
    });

    const bundle: Record<string, unknown> = {
      runKind: state.runKind,
      tickAt: state.tickAt,
      traceId: state.traceId,
      triggerSource: state.triggerSource,
      triggerRef: state.triggerRef || undefined,
    };

    const safe = async (label: string, fn: () => Promise<void>): Promise<void> => {
      try {
        await fn();
      } catch (e: unknown) {
        bundle[`${label}Error`] = this.formatErrorMessage(e);
      }
    };

    const searchQuery =
      state.runKind === 'breakdown'
        ? `战略拆解目标: ${state.goal.slice(0, 500)}`
        : '公司待办、最近决策与运营上下文';

    const ingestTaskPageSize =
      state.runKind === 'breakdown'
        ? this.config.getCeoBreakdownIngestTaskPageSize()
        : 50;

    /**
     * 原先串行 await 8+ 次 API RPC，单次排队几十 ms～数秒时会线性累加；
     * 群聊 @CEO 触发 breakdown 时用户体感「大模型慢」，实际常耗在 ingest。
     */
    await Promise.all([
      safe('dashboard', async () => {
        bundle.dashboard = await this.rpc(
          'dashboard.companySummary',
          { companyId, actor },
          state.traceId,
        );
      }),
      safe('supervisorLessons', async () => {
        const mainRoom = await this.rpc<{ id?: string } | null>(
          'collaboration.rooms.findMain',
          { companyId, actor },
          state.traceId,
        ).catch(() => null);
        const collab = state.collaborationRoomId?.trim();
        const memoryRoomId =
          state.runKind === 'breakdown' && collab ? collab : mainRoom?.id;
        const q = `失败复盘教训 prevention: ${searchQuery.slice(0, 300)}`;
        try {
          if (this.config.isAutonomousMemoryAdapterEnabled()) {
            bundle.supervisorLessons = await this.memoryPort.search({
              companyId,
              actor,
              data: {
                query: q,
                topK: 5,
                roomId: memoryRoomId,
                pipelineTraceId: state.traceId,
              },
            });
          } else {
            bundle.supervisorLessons = await this.rpc(
              'memory.search.hierarchy',
              {
                companyId,
                actor,
                data: {
                  query: q,
                  topK: 5,
                  roomId: memoryRoomId,
                },
              },
              state.traceId,
            );
          }
        } catch (e: unknown) {
          if (this.isMemoryNamespaceForbidden(e)) {
            bundle.supervisorLessons = [];
            return;
          }
          throw e;
        }
      }),
      safe('memorySearch', async () => {
        const mainRoom = await this.rpc<{ id?: string } | null>(
          'collaboration.rooms.findMain',
          { companyId, actor },
          state.traceId,
        ).catch(() => null);
        const collab = state.collaborationRoomId?.trim();
        /** 群聊 @CEO：记忆检索应对应当前房间，而非仅主群 */
        const memoryRoomId =
          state.runKind === 'breakdown' && collab ? collab : mainRoom?.id;
        try {
          if (this.config.isAutonomousMemoryAdapterEnabled()) {
            bundle.memorySearch = await this.memoryPort.search({
              companyId,
              actor,
              data: {
                query: searchQuery,
                topK: 8,
                roomId: memoryRoomId,
                pipelineTraceId: state.traceId,
              },
            });
          } else {
            bundle.memorySearch = await this.rpc(
              'memory.search',
              {
                companyId,
                actor,
                data: { query: searchQuery, topK: 8, roomId: memoryRoomId },
              },
              state.traceId,
            );
          }
        } catch (e: unknown) {
          if (this.isMemoryNamespaceForbidden(e)) {
            bundle.memorySearch = [];
            return;
          }
          throw e;
        }
      }),
      safe('budgets', async () => {
        bundle.budgets = await this.rpc('billing.budgets.list', { companyId, actor }, state.traceId);
      }),
    ]);
    this.logger.log('CEO ingest wave1 done (dashboard+memory+budgets)', {
      traceId: state.traceId,
      msSinceIngestStart: Date.now() - ingestStarted,
    });

    await Promise.all(
      (['pending', 'in_progress', 'review'] as const).map((status) =>
        safe(`tasks_${status}`, async () => {
          bundle[`tasks_${status}`] = await this.rpc(
            'tasks.findAll',
            {
              companyId,
              actor,
              status,
              pageSize: ingestTaskPageSize,
              page: 1,
            },
            state.traceId,
          );
        }),
      ),
    );
    this.logger.log('CEO ingest wave2 done (tasks x3)', {
      traceId: state.traceId,
      msSinceIngestStart: Date.now() - ingestStarted,
    });

    await Promise.all([
      safe('organizationTree', async () => {
        bundle.organizationTree = await this.rpc(
          'organization.tree',
          {
            companyId,
            actor,
          },
          state.traceId,
        );
      }),
      safe('ceoAgents', async () => {
        bundle.ceoAgents = await this.rpcInteractive<{ items?: unknown[]; total?: number }>(
          'agents.findAll',
          {
            companyId,
            actor,
            role: 'ceo',
            status: 'active',
            pageSize: 10,
            page: 1,
          },
        );
      }),
    ]);
    this.logger.log('CEO ingest wave3 done (orgTree+ceoAgents)', {
      traceId: state.traceId,
      msSinceIngestStart: Date.now() - ingestStarted,
    });

    await safe('modelRouter', async () => {
      const ceo = (bundle.ceoAgents as { items?: { llmModel?: string | null }[] })?.items?.[0];
      const baseline =
        state.triggerSource === 'collaboration_mention'
          ? 'high'
          : state.triggerSource === 'budget_warning'
            ? 'low'
            : 'normal';
      let taskPriority: 'low' | 'normal' | 'high' | 'urgent' = baseline;
      if (this.config.isCostAwareRoutingEnabled()) {
        const effective = await this.l1FeatureFlags.isCostAwareRoutingEffective(companyId);
        const complexityScore = Math.min(1, JSON.stringify(bundle).length / 50_000);
        taskPriority = await this.costAwareRouter.decideTaskPriority({
          companyId,
          effective,
          agentLevel: 1,
          complexityScore,
          baselinePriority: baseline,
        });
      }
      bundle.modelRouter = await this.rpc(
        'billing.modelRouter.resolve',
        {
          companyId,
          actor,
          agentRole: 'ceo',
          agentPreferredModel: ceo?.llmModel ?? undefined,
          taskPriority,
        },
        state.traceId,
      );
    });

    const ingestErrors = Object.entries(bundle).filter(
      ([k, v]) => k.endsWith('Error') && v != null && String(v).length > 0,
    );
    for (const [key, msg] of ingestErrors) {
      this.logger.warn(`CEO ingest ${key}`, {
        traceId: state.traceId,
        companyId,
        message: String(msg).slice(0, 500),
      });
    }

    this.logger.log('CEO ingest finished', {
      companyId,
      traceId: state.traceId,
      runKind: state.runKind,
      triggerSource: state.triggerSource,
      ms: Date.now() - ingestStarted,
      contextApproxChars: JSON.stringify(bundle).length,
      errorDetails: Object.fromEntries(ingestErrors),
    });

    let ceoAgentId = '';
    try {
      const agents = bundle.ceoAgents as { items?: { id: string }[] };
      ceoAgentId = agents?.items?.[0]?.id ?? '';
    } catch {
      ceoAgentId = '';
    }
    if (ceoAgentId) {
      const now = Date.now();
      this.ceoAgentIdCache.set(companyId, { agentId: ceoAgentId, expiresAt: now + 5 * 60_000 });
    }

    (bundle as Record<string, unknown>).memoryReferences = memoryReferencesFromSearchHits(bundle.memorySearch);

    return {
      contextBundle: JSON.stringify(bundle),
      ceoAgentId,
    };
  }

  private async plan(state: CeoSupervisorState, singleFlightWrapped = false): Promise<Partial<CeoSupervisorState>> {
    if (!singleFlightWrapped) {
      const sf = await this.resilience.runSingleFlight(this.planSingleFlightKey(state), async () =>
        this.plan(state, true),
      );
      if (sf.shared) {
        this.monitoring?.incCeoPlanFailfast('single_flight_shared');
        this.logger.warn('autonomous-trace | ceo_plan.single_flight_shared', {
          traceId: state.traceId,
          companyId: state.companyId,
          runKind: state.runKind,
        });
      }
      return sf.value;
    }
    this.logger.log('CEO plan node entered', {
      companyId: state.companyId,
      traceId: state.traceId,
      runKind: state.runKind,
      triggerSource: state.triggerSource,
    });

    const cooldown = this.resilience.isCoolingDown(this.planRateLimitCooldownKey(state));
    if (cooldown.active) {
      this.monitoring?.incCeoPlanRateLimit('cooldown_block');
      this.monitoring?.incCeoPlanFailfast('rate_limit_cooldown');
      this.logger.warn('autonomous-trace | ceo_plan.rate_limit_failfast', {
        traceId: state.traceId,
        companyId: state.companyId,
        runKind: state.runKind,
        cooldownRemainingMs: cooldown.remainingMs,
        reason: cooldown.reason ?? 'rate_limit',
      });
      const fallback: CeoPlanOutput = {
        summary: '【系统提示】当前规划通道触发短时限流保护，已自动切换轻量策略。请稍后重试。',
        tasks: [],
        neededSkills: [],
        requiresHumanApproval: false,
      };
      return {
        skipPlanReason: 'rate_limit_cooldown_failfast',
        planResultJson: JSON.stringify(fallback),
        llmMetaJson: JSON.stringify({
          skipped: true,
          stage: 'rate_limit_cooldown',
          cooldownRemainingMs: cooldown.remainingMs,
        }),
      };
    }

    const estimated = this.config.getCeoLlmEstimatedCost();
    const actor = this.actor();
    let skipPlanReason = '';
    const tAllowance = Date.now();
    try {
      const allowance = await this.rpcInteractive<{
        allowed: boolean;
        utilization: number;
        reason?: string;
      }>('billing.checkAllowance', {
        companyId: state.companyId,
        actor,
        estimatedCost: estimated,
      });
      if (!allowance.allowed) {
        skipPlanReason = `预算不足，跳过 LLM 规划 (${allowance.reason ?? 'blocked'})`;
      }
    } catch (e: unknown) {
      skipPlanReason = `checkAllowance 失败: ${e instanceof Error ? e.message : String(e)}`;
    }
    this.logger.log('CEO plan checkAllowance', {
      traceId: state.traceId,
      ms: Date.now() - tAllowance,
      skippedLlm: Boolean(skipPlanReason),
    });

    if (skipPlanReason) {
      const empty: CeoPlanOutput = {
        summary: skipPlanReason,
        tasks: [],
        neededSkills: [],
        requiresHumanApproval: false,
      };
      return {
        skipPlanReason,
        planResultJson: JSON.stringify(empty),
        llmMetaJson: JSON.stringify({ skipped: true }),
      };
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(state.contextBundle || '{}') as Record<string, unknown>;
    } catch {
      parsed = {};
    }

    const modelRouter = parsed.modelRouter as
      | { modelName: string; degraded: boolean; utilization: number; reason: string }
      | undefined;
    const modelName = (
      modelRouter?.modelName ||
      this.config.getCeoSupervisionModel() ||
      this.config.getCeoOrchestrationModel() ||
      this.config.getCollabDirectReplyModel() ||
      ''
    ).trim();
    if (!modelName) {
      throw new Error('missing_model_router_and_no_configured_fallback_model');
    }

    const ceoAgentRow = (parsed.ceoAgents as { items?: { llmKeyId?: string | null }[] } | undefined)?.items?.[0];

    const orgTree = (parsed.organizationTree ?? []) as OrgTreeNodeShape[];
    const orgPrompt = orgTree.length ? compactOrgTreeForPrompt(orgTree) : '(无组织树)';

    // 显式拼“最近记忆 + 教训”供模型参考，减少空洞计划
    const memoryLines: string[] = [];
    const memArr = Array.isArray(parsed.memorySearch) ? parsed.memorySearch : [];
    for (let i = 0; i < Math.min(3, memArr.length); i += 1) {
      const it = memArr[i] as Record<string, unknown>;
      const snippet =
        typeof it?.snippet === 'string'
          ? it.snippet
          : typeof it?.content === 'string'
            ? it.content
            : '';
      if (snippet?.trim()) {
        memoryLines.push(`- Memory#${i + 1}: ${snippet.trim().slice(0, 260)}`);
      }
    }
    const supArr = Array.isArray(parsed.supervisorLessons) ? parsed.supervisorLessons : [];
    for (let i = 0; i < Math.min(3, supArr.length); i += 1) {
      const it = supArr[i] as Record<string, unknown>;
      const snippet =
        typeof it?.snippet === 'string'
          ? it.snippet
          : typeof it?.content === 'string'
            ? it.content
            : '';
      if (snippet?.trim()) {
        memoryLines.push(`- Lesson#${i + 1}: ${snippet.trim().slice(0, 260)}`);
      }
    }
    const recentContext = memoryLines.join('\n').slice(0, 1200);

    const systemPromptPrefix = await this.ceoLayerConfigResolver.getFullPrompt({
      companyId: state.companyId,
      layer: 'supervision',
      purpose: 'autonomous_plan_intent_json',
      vars: {
        // Only supply what differs per attempt; strict JSON shell defaults live in resolver.
        schemaLabel: 'Intent Schema',
        schemaHint:
          '{"summary":"string(10-800)","nextStep":"generate_tasks|summary_only","requiresHumanApproval":"boolean","approvalReason?":"string","neededSkills?":"string[]<=5(kebab-case)"}',
        neededSkillsSpec:
          '输出字段约束：`neededSkills` 为可选数组（skill slug，kebab-case），仅在确有必要时填写；最多 5 个。',
        orgPrompt,
        recentContext: recentContext || '(无)',
        budgetLine: `预算利用率: ${modelRouter?.utilization ?? 'n/a'}；模型降级: ${modelRouter?.degraded ? '是' : '否'}。`,
      },
    });

    let llmInvokeStartedAt = 0;
    try {
      const fixedLlmKeyId =
        typeof ceoAgentRow?.llmKeyId === 'string' && ceoAgentRow.llmKeyId.trim()
          ? ceoAgentRow.llmKeyId.trim()
          : undefined;

      // For breakdown runs (Layer-3 heavy), prefer per-layer key pool candidates when available.
      let candidateLlmKeyIds: string[] = [];
      if (state.runKind === 'breakdown') {
        try {
          const pool = await this.rpcInteractive<{ llmKeyIds?: string[]; source?: string }>(
            'agents.llmKeyPoolCandidates',
            {
              companyId: state.companyId,
              actor: this.actor(),
              id: state.ceoAgentId || undefined,
              ceoContext: 'heavy',
            } as Record<string, unknown>,
          );
          candidateLlmKeyIds = Array.isArray(pool?.llmKeyIds)
            ? pool.llmKeyIds.map((x) => String(x).trim()).filter(Boolean)
            : [];
          this.logger.log(`${COLLAB_LLM_TRACE} | layer3.key_pool`, {
            traceId: state.traceId,
            sourceMessageId: state.triggerRef || null,
            companyId: state.companyId,
            rootTaskId: state.rootTaskId ?? null,
            candidateCount: candidateLlmKeyIds.length,
            candidateIdsPreview: candidateLlmKeyIds.slice(0, 8),
            source: pool?.source ?? null,
          });
        } catch (e: unknown) {
          this.logger.warn(`${COLLAB_LLM_TRACE} | layer3.key_pool_failed`, {
            traceId: state.traceId,
            sourceMessageId: state.triggerRef || null,
            companyId: state.companyId,
            message: this.formatErrorMessage(e).slice(0, 800),
          });
        }
      }

      const tKey = Date.now();
      const llmKey = await this.llmKeyResolver.acquireWithFallback({
        companyId: state.companyId,
        requestedModelName: modelName,
        fixedLlmKeyId,
        candidateLlmKeyIds,
      });
      this.logger.log('CEO plan llmKey acquire', {
        traceId: state.traceId,
        ms: Date.now() - tKey,
        modelName,
        llmKeyId: llmKey.llmKeyId,
        resolvedModelName: llmKey.modelName ?? null,
        providerKind: llmKey.providerKind ?? null,
        baseUrl: safeLlmBaseUrlForLog(llmKey.requestUrl),
      });

      const effectiveModelName = llmKey.modelName || modelName;
      const isGlmBreakdown =
        state.runKind === 'breakdown' && effectiveModelName.toLowerCase().includes('glm');
      const contextSliceChars = this.config.getCeoPlanContextSliceChars(
        effectiveModelName,
        state.runKind,
      );
      const useGlmSlimContext = isGlmBreakdown && this.config.isCeoGlmSlimContextEnabled();
      const maxLlmAttempts = useGlmSlimContext ? 3 : 2;
      const max429Retries = this.config.getAutonomousPlan429RetryMaxAttempts();
      const backoffBaseMs = this.config.getAutonomousPlan429BackoffBaseMs();
      let rateLimitRetriesUsed = 0;
      // breakdown（含群聊 @CEO）走结构化输出，比心跳慢；默认用更长超时，减少 OpenAI「Request timed out」
      const llmTimeoutMs =
        state.runKind === 'breakdown'
          ? this.config.getCollaborationLlmTimeoutMs()
          : this.config.getCeoLlmTimeoutMs();
      const glmMaxOut = isGlmBreakdown ? this.config.getCeoGlmMaxOutputTokens() : undefined;
      const model = this.chatFactory.create(
        effectiveModelName,
        llmKey.apiKey,
        llmKey.providerKind,
        llmKey.requestUrl,
        llmTimeoutMs,
        glmMaxOut,
      );
      const soMethod = structuredOutputMethodForCeoPlan(effectiveModelName);
      const structuredOpts =
        soMethod === 'jsonSchema' ? ({ method: 'jsonSchema' as const } as object) : { method: 'jsonMode' as const };
      const bindStructured = (schema: unknown, label: string) => {
        try {
          return (model as { withStructuredOutput: (s: unknown, c?: object) => any }).withStructuredOutput(
            schema,
            structuredOpts,
          );
        } catch (e: unknown) {
          const es = this.formatErrorMessage(e);
          if (/transforms cannot be represented|json schema/i.test(es)) {
            this.logger.warn('CEO plan: json_schema conversion failed; falling back to json_mode', {
              traceId: state.traceId,
              label,
              detail: es.slice(0, 500),
            });
            return (model as { withStructuredOutput: (s: unknown, c?: object) => any }).withStructuredOutput(schema, {
              method: 'jsonMode' as const,
            });
          }
          throw e;
        }
      };
      const structuredIntent = bindStructured(ceoPlanIntentSchema, 'intent');
      const structuredTasks = bindStructured(ceoPlanTasksExpansionSchema, 'tasks');

      const intentSchemaHint =
        '{"summary":"string(10-800)","nextStep":"generate_tasks|summary_only","requiresHumanApproval":"boolean","approvalReason?":"string","neededSkills?":"string[]<=5(kebab-case)"}';
      const taskSchemaHint =
        '{"tasks":[{"title":"string","description?":"string","organizationNodeId?":"uuid","assigneeAgentId?":"uuid","priority?":"low|normal|high|urgent"}]<=20}';
      const systemFull = systemPromptPrefix;
      const systemForLlm = isGlmBreakdown
        ? systemFull.slice(0, 3200)
        : systemFull;

      let rawIntent: unknown;
      let usedContextChars = contextSliceChars;
      let lastUserContent = '';
      llmInvokeStartedAt = Date.now();
      const tLlm = llmInvokeStartedAt;

      for (let attempt = 1; attempt <= maxLlmAttempts; attempt += 1) {
        let userContent: string;
        if (useGlmSlimContext) {
          const mode = attempt === 1 ? 'slim' : attempt === 2 ? 'slimmer' : 'minimal';
          const ctxJson = this.buildGlmBreakdownSlimContextJson(state, parsed, orgTree, mode);
          usedContextChars = ctxJson.length;
          userContent = [
            `trigger=${state.triggerSource}`,
            state.triggerRef ? `triggerRef=${state.triggerRef}` : null,
            state.runKind === 'breakdown' ? `goal=${state.goal.slice(0, 2000)}` : null,
            `context=${ctxJson}`,
          ]
            .filter(Boolean)
            .join('\n');
        } else {
          const slice =
            attempt === 1
              ? contextSliceChars
              : Math.max(2000, Math.floor(contextSliceChars * 0.45));
          usedContextChars = slice;
          userContent = [
            `trigger=${state.triggerSource}`,
            state.triggerRef ? `triggerRef=${state.triggerRef}` : null,
            state.runKind === 'breakdown' ? `goal=${state.goal.slice(0, 2000)}` : null,
            `context=${state.contextBundle.slice(0, slice)}`,
          ]
            .filter(Boolean)
            .join('\n');
        }

        lastUserContent = userContent;

        const sysForAttemptRaw = useGlmSlimContext && attempt >= 3 ? systemForLlm.slice(0, 1800) : systemForLlm;
        const sysForAttempt =
          soMethod === 'jsonMode' ? ensureJsonKeywordForStructuredOutput(sysForAttemptRaw) : sysForAttemptRaw;

        this.logger.log(
          soMethod === 'jsonSchema'
            ? 'CEO plan calling LLM (structured json_schema)'
            : 'CEO plan calling LLM (structured json_mode for OpenAI-compatible providers)',
          {
            traceId: state.traceId,
            model: effectiveModelName,
            structuredOutputMethod: soMethod,
            clientTimeoutMs: llmTimeoutMs,
            userContentChars: userContent.length,
            contextMode: useGlmSlimContext
              ? attempt === 1
                ? 'glm_slim'
                : attempt === 2
                  ? 'glm_slimmer'
                  : 'glm_minimal'
              : 'bundle_slice',
            contextPayloadChars: usedContextChars,
            glmMaxOutputTokens: glmMaxOut ?? null,
            attempt,
            maxAttempts: maxLlmAttempts,
            systemChars: sysForAttempt.length,
            systemHash: createHash('sha256').update(sysForAttempt).digest('hex').slice(0, 16),
            userHash: createHash('sha256').update(userContent).digest('hex').slice(0, 16),
            runKind: state.runKind,
            rootTaskId: state.rootTaskId ?? null,
            sourceMessageId: state.triggerRef || null,
          },
        );

        try {
          rawIntent = (await structuredIntent.invoke([
            new SystemMessage(sysForAttempt),
            new HumanMessage(userContent),
          ])) as unknown;
          if (attempt > 1) {
            const ctxLabel = useGlmSlimContext
              ? attempt === 2
                ? 'glm_slimmer'
                : 'glm_minimal'
              : 'bundle_slice';
            this.logger.log('CEO plan LLM succeeded after retry', {
              traceId: state.traceId,
              attempt,
              contextMode: ctxLabel,
            });
          }
          break;
        } catch (e: unknown) {
          const errMsg = this.formatErrorMessage(e);
          if (isJsonObjectPromptFormatError(errMsg) && soMethod === 'jsonMode') {
            this.logger.warn('CEO plan json_mode prompt rejected; retrying with explicit json hint', {
              traceId: state.traceId,
              attempt,
            });
            try {
              rawIntent = (await structuredIntent.invoke([
                new SystemMessage(ensureJsonKeywordForStructuredOutput(sysForAttemptRaw)),
                new HumanMessage(`${userContent}\n\nReturn JSON only.`),
              ])) as unknown;
              break;
            } catch (retryErr: unknown) {
              throw retryErr;
            }
          }
          if (this.isRateLimitError(errMsg)) {
            this.monitoring?.incCeoPlanRateLimit('llm_call');
            if (rateLimitRetriesUsed < max429Retries) {
              rateLimitRetriesUsed += 1;
              const jitterMs = Math.floor(Math.random() * 500);
              const waitMs = backoffBaseMs * 2 ** (rateLimitRetriesUsed - 1) + jitterMs;
              this.logger.warn('autonomous-trace | ceo_plan.rate_limit_backoff_retry', {
                traceId: state.traceId,
                companyId: state.companyId,
                attempt,
                rateLimitRetriesUsed,
                waitMs,
              });
              await this.sleep(waitMs);
              continue;
            }
            throw e;
          }
          if (attempt >= maxLlmAttempts || !this.isLikelyLlmTimeoutError(e)) {
            throw e;
          }
          this.logger.warn('CEO plan LLM timeout; retrying with smaller payload', {
            traceId: state.traceId,
            attempt,
            nextAttempt: attempt + 1,
          });
        }
      }

      this.logger.log('CEO plan LLM invoke', {
        traceId: state.traceId,
        ms: Date.now() - tLlm,
        model: effectiveModelName,
        clientTimeoutMs: llmTimeoutMs,
        contextPayloadCharsUsed: usedContextChars,
      });

      let intentRepairAttempts = 0;
      let tasksRepairAttempts = 0;
      let intentFallbackUsed = false;
      let tasksFallbackUsed = false;
      const checkedIntent = ceoPlanIntentSchema.safeParse(rawIntent);
      const safeIntent = checkedIntent.success
        ? checkedIntent.data
        : await this.repairStructuredOutputByLlm(
            model as unknown as { invoke: (msgs: unknown[]) => Promise<unknown> },
            'intent',
            ceoPlanIntentSchema,
            intentSchemaHint,
            systemForLlm,
            lastUserContent,
            rawIntent,
            checkedIntent.error.issues,
            2,
            (attempt) => {
              intentRepairAttempts = attempt;
            },
          );
      if (!safeIntent) {
        intentFallbackUsed = true;
        const issueText = checkedIntent.success
          ? 'unknown_intent_parse_failure'
          : this.renderZodIssues(checkedIntent.error.issues);
        this.logger.warn('CEO plan intent unrecoverable; soft failure path', {
          traceId: state.traceId,
          model: effectiveModelName,
          issues: checkedIntent.success ? [] : checkedIntent.error.issues.map((i) => `${i.path.join('.') || 'root'}:${i.message}`).slice(0, 10),
        });
        this.monitoring?.incStructuredOutputParseFailure('ceo_heartbeat', 'plan_intent_fallback');
        this.monitoring?.incCeoPlanningFallback();
        await this.executionLog.appendForRun(state.companyId, state.traceId, {
          stepType: 'ceo.plan.intent',
          traceId: state.traceId,
          message: 'fallback',
          outputSnapshot: {
            systemPromptPreview: systemForLlm.slice(0, 800),
            userPromptPreview: lastUserContent.slice(0, 800),
            rawPreview: JSON.stringify(rawIntent).slice(0, 1200),
            repaired: false,
            repairAttempts: intentRepairAttempts,
          },
        });
        return await this.finalizeCeoPlanSoftFailurePath({
          state,
          technicalDetail: `规划输出 schema 校验失败（intent）: ${issueText}`,
          kind: 'intent_parse',
          skipPlanReasonCode: 'intent_structured_output_failed',
          friendlySummaryNoHitl: `${CEO_PLAN_DEFAULT_SUMMARY} 若你只是在问能力、skills 或常见问题，可忽略任务区；我已尽量用轻量对话继续回复。`,
        });
      }

      if (checkedIntent.success) {
        this.monitoring?.incCeoPlanningNativeStructuredSuccess('intent');
      } else {
        this.monitoring?.incStructuredOutputParseFailure('ceo_heartbeat', 'plan_intent_repaired');
        await this.executionLog.appendForRun(state.companyId, state.traceId, {
          stepType: 'ceo.plan.intent',
          traceId: state.traceId,
          message: 'repaired',
          outputSnapshot: {
            systemPromptPreview: systemForLlm.slice(0, 800),
            userPromptPreview: lastUserContent.slice(0, 800),
            rawPreview: JSON.stringify(rawIntent).slice(0, 1200),
            repairedOutputPreview: JSON.stringify(safeIntent).slice(0, 1200),
          },
        });
      }

      let tasks: CeoPlanOutput['tasks'] = [];
      if (safeIntent.nextStep === 'generate_tasks') {
      const taskSystem = await this.ceoLayerConfigResolver.getFullPrompt({
        companyId: state.companyId,
        layer: 'supervision',
        purpose: 'autonomous_plan_tasks_json',
        vars: {
          schemaLabel: 'Task Schema',
          schemaHint: taskSchemaHint,
          orgPrompt,
        },
      });
        const taskUser = [
          `trigger=${state.triggerSource}`,
          state.triggerRef ? `triggerRef=${state.triggerRef}` : null,
          state.runKind === 'breakdown' ? `goal=${state.goal.slice(0, 2000)}` : null,
          `intent_summary=${safeIntent.summary.slice(0, 600)}`,
          `requires_approval=${safeIntent.requiresHumanApproval ? 'true' : 'false'}`,
          safeIntent.approvalReason ? `approval_reason=${safeIntent.approvalReason.slice(0, 500)}` : null,
          `context=${state.contextBundle.slice(0, Math.max(2000, Math.floor(usedContextChars * 0.6)))}`,
        ]
          .filter(Boolean)
          .join('\n');
        const rawTasks = (await structuredTasks.invoke([
          new SystemMessage(taskSystem),
          new HumanMessage(taskUser),
        ])) as unknown;
        const checkedTasks = ceoPlanTasksExpansionSchema.safeParse(rawTasks);
        const safeTasks = checkedTasks.success
          ? checkedTasks.data
          : await this.repairStructuredOutputByLlm(
              model as unknown as { invoke: (msgs: unknown[]) => Promise<unknown> },
              'tasks',
              ceoPlanTasksExpansionSchema,
              taskSchemaHint,
              taskSystem,
              taskUser,
              rawTasks,
              checkedTasks.error.issues,
              2,
              (attempt) => {
                tasksRepairAttempts = attempt;
              },
            );
        if (safeTasks) {
          tasks = safeTasks.tasks;
          if (checkedTasks.success) {
            this.monitoring?.incCeoPlanningNativeStructuredSuccess('tasks');
          } else {
            this.monitoring?.incStructuredOutputParseFailure('ceo_heartbeat', 'plan_tasks_repaired');
            await this.executionLog.appendForRun(state.companyId, state.traceId, {
              stepType: 'ceo.plan.tasks',
              traceId: state.traceId,
              message: 'repaired',
              outputSnapshot: {
                systemPromptPreview: taskSystem.slice(0, 800),
                userPromptPreview: taskUser.slice(0, 800),
                rawPreview: JSON.stringify(rawTasks).slice(0, 1200),
                repairedOutputPreview: JSON.stringify(safeTasks).slice(0, 1200),
              },
            });
          }
        } else {
          tasksFallbackUsed = true;
          this.logger.warn('CEO plan tasks unrecoverable; downgrade to summary_only', {
            traceId: state.traceId,
            model: effectiveModelName,
          });
          this.monitoring?.incStructuredOutputParseFailure('ceo_heartbeat', 'plan_tasks_fallback');
          this.monitoring?.incCeoPlanningFallback();
          await this.executionLog.appendForRun(state.companyId, state.traceId, {
            stepType: 'ceo.plan.tasks',
            traceId: state.traceId,
            message: 'fallback',
            outputSnapshot: {
              systemPromptPreview: taskSystem.slice(0, 800),
              userPromptPreview: taskUser.slice(0, 800),
              rawPreview: JSON.stringify(rawTasks).slice(0, 1200),
              repaired: false,
              repairAttempts: tasksRepairAttempts,
            },
          });
        }
      }

      const result: CeoPlanOutput = ceoPlanSchema.parse({
        summary: safeIntent.summary,
        tasks,
        neededSkills: safeIntent.neededSkills ?? [],
        requiresHumanApproval: safeIntent.requiresHumanApproval,
        approvalReason: safeIntent.approvalReason == null ? undefined : safeIntent.approvalReason,
      });

      // Layer-3 (Heavy/Breakdown) response log: what the LLM produced (clipped)
      if (state.runKind === 'breakdown') {
        this.logger.log(`${COLLAB_LLM_TRACE} | layer3.plan.response`, {
          traceId: state.traceId,
          sourceMessageId: state.triggerRef || null,
          companyId: state.companyId,
          rootTaskId: state.rootTaskId ?? null,
          modelName: effectiveModelName,
          llmKeyId: llmKey.llmKeyId,
          baseUrl: safeLlmBaseUrlForLog(llmKey.requestUrl),
          summaryPreview: this.clip(result.summary, 800),
          tasksCount: result.tasks.length,
          tasksPreview: this.clip(JSON.stringify(result.tasks.slice(0, 3)), 1200),
          requiresHumanApproval: result.requiresHumanApproval,
        });
      }

      const userContentForBilling = lastUserContent;

      const estimateTokens = (text: string): number => {
        // 简易估算：平均 1 token ≈ 4 chars（仅用于计费的近似；用于 UI 预算/配额告警足够）
        return Math.max(1, Math.ceil(text.length / 4));
      };

      const usage =
        (rawIntent as any)?.usage ||
        (rawIntent as any)?.response_metadata?.usage ||
        (rawIntent as any)?.llmOutput?.tokenUsage ||
        (rawIntent as any)?.tokenUsage;

      const inputTokens =
        typeof usage?.prompt_tokens === 'number'
          ? usage.prompt_tokens
          : estimateTokens(`${systemForLlm}\n${userContentForBilling}`);
      const outputTokens =
        typeof usage?.completion_tokens === 'number'
          ? usage.completion_tokens
          : estimateTokens(JSON.stringify(result));

      const meta = {
        modelName: effectiveModelName,
        llmKeyId: llmKey.llmKeyId,
        inputTokens,
        outputTokens,
      };

      await this.publishLlmBilling(state, meta);

      this.resetCeoPlanSoftFailureStreak(state.companyId);

      return {
        planResultJson: JSON.stringify(result),
        llmMetaJson: JSON.stringify(meta),
      };
    } catch (e: unknown) {
      const msg = this.formatErrorMessage(e);
      if (this.isRateLimitError(msg)) {
        this.monitoring?.incCeoPlanRateLimit('soft_failure');
        this.resilience.openCooldown(
          this.planRateLimitCooldownKey(state),
          this.config.getAutonomousPlanRateLimitCooldownMs(),
          'provider_429',
        );
      }
      const llmElapsedMs = llmInvokeStartedAt > 0 ? Date.now() - llmInvokeStartedAt : undefined;
      const likelyUpstreamReadTimeout =
        /timed out/i.test(msg) &&
        llmElapsedMs !== undefined &&
        llmElapsedMs >= 140_000 &&
        llmElapsedMs <= 170_000;
      this.logger.warn('CEO plan failed', {
        traceId: state.traceId,
        message: msg,
        llmElapsedMs,
        likelyUpstreamReadTimeout,
        hint: likelyUpstreamReadTimeout
          ? 'elapsed≈150s 且 SDK 超时更大时，多为供应商/反向代理读超时；可换模型、缩短 context（WORKER_CEO_GLM_PLAN_CONTEXT_MAX_CHARS）或联系线路'
          : undefined,
      });
      const friendlyTimeout =
        /timed out|timeout/i.test(msg) && state.runKind === 'breakdown'
          ? '抱歉，本次规划调用大模型超时（常见于智谱等线路约 150 秒限制或网络波动）。请稍后再试，或请管理员为 CEO 更换更稳定的模型/线路。'
          : `规划失败: ${msg}`;
      const friendlyNoHitl =
        /timed out|timeout/i.test(msg) && state.runKind === 'breakdown'
          ? friendlyTimeout
          : `${CEO_PLAN_DEFAULT_SUMMARY} 自动规划暂时中断，你可继续用对话提问；若多次失败将才需要人工审批。技术摘要：${this.clip(msg, 280)}`;
      const rateLimitSuppressed = this.isRateLimitError(msg);
      return await this.finalizeCeoPlanSoftFailurePath({
        state,
        technicalDetail: msg,
        kind: 'plan_exception',
        skipPlanReasonCode: friendlyTimeout,
        friendlySummaryNoHitl: friendlyNoHitl,
        suppressHitl: rateLimitSuppressed,
      });
    }
  }

  private async publishLlmBilling(
    state: CeoSupervisorState,
    meta: { modelName: string; llmKeyId: string; inputTokens?: number; outputTokens?: number },
  ): Promise<void> {
    const evt: BillingConsumptionRequestedEvent = {
      eventId: randomUUID(),
      eventType: 'billing.consumption.requested',
      aggregateId: state.companyId,
      aggregateType: 'billing',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: state.companyId,
      data: {
        companyId: state.companyId,
        recordType: 'llm',
        agentId: state.ceoAgentId || undefined,
        modelName: meta.modelName,
        llmKeyId: meta.llmKeyId,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        idempotencyKey: `ceo:${state.companyId}:${state.traceId}:plan`,
        metadata: { traceId: state.traceId },
      },
    };
    await this.messaging.publish(evt, {
      routingKey: 'billing.consumption.requested',
      persistent: true,
    });
  }

  /**
   * CEO → 部门：对带 organizationNodeId 但未指定 assigneeAgentId 的任务，按节点解析默认执行 Agent。
   */
  private async hierarchicalExpand(state: CeoSupervisorState): Promise<Partial<CeoSupervisorState>> {
    if (this.readEarlyExitSnapshot(state).earlyExit) {
      trace.getActiveSpan()?.setAttribute('foundry.ceo.layer_stopped_at', 1);
      return {
        hierarchicalMetaJson: JSON.stringify({
          earlyExitSkippedExpand: true,
          layerStoppedAt: 1,
          autoAssigned: [],
          errors: [],
          breakdownContext: readBreakdownContextFromState(state.hierarchicalMetaJson),
        }),
      };
    }
    const plan = this.parseCeoPlanWithGuard(state.planResultJson, state.traceId, 'hierarchicalExpand');

    // plan 输出的 neededSkills：异步触发绑定，不阻塞本轮 pipeline（后续执行阶段自然走 snapshots 注入）
    void this.handleNeededSkills(state, plan).catch((e) => {
      this.logger.warn('CEO neededSkills preload failed', {
        traceId: state.traceId,
        companyId: state.companyId,
        message: this.formatErrorMessage(e).slice(0, 800),
      });
    });

    const actor = this.actor();
    const meta: {
      autoAssigned: { title: string; organizationNodeId: string; assigneeAgentId: string }[];
      errors: { title?: string; message: string }[];
    } = { autoAssigned: [], errors: [] };

    const tasks = [...plan.tasks];
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]!;
      if (!t.organizationNodeId || t.assigneeAgentId) {
        continue;
      }

      try {
        const res = await this.rpc<{ items?: { id: string }[] }>(
          'agents.findAll',
          {
            companyId: state.companyId,
            actor,
            organizationNodeId: t.organizationNodeId,
            status: 'active',
            pageSize: 20,
            page: 1,
          },
          state.traceId,
        );
        const items = res?.items ?? [];
        const executors = items.filter((a) => a?.id);
        const pick = executors[0];
        if (!pick) {
          meta.errors.push({
            title: t.title,
            message: `节点 ${t.organizationNodeId} 下无活跃 Agent，保持 organization 级指派`,
          });
          continue;
        }
        tasks[i] = { ...t, assigneeAgentId: pick.id };
        meta.autoAssigned.push({
          title: t.title,
          organizationNodeId: t.organizationNodeId,
          assigneeAgentId: pick.id,
        });
      } catch (e: unknown) {
        meta.errors.push({
          title: t.title,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const updatedPlan: CeoPlanOutput = { ...plan, tasks };
    return {
      planResultJson: JSON.stringify(updatedPlan),
      hierarchicalMetaJson: JSON.stringify({
        ...meta,
        breakdownContext: readBreakdownContextFromState(state.hierarchicalMetaJson),
      }),
    };
  }

  private normalizeNeededSkills(raw?: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const items = raw.map((x) => String(x ?? '').trim()).filter(Boolean);
    // hard guard: avoid context/tool explosion even if upstream schema/prompt is bypassed
    return [...new Set(items)].slice(0, 5);
  }

  /**
   * Worker 侧统一处理 CEO plan 的 neededSkills：
   * - 将 skill name/slug 解析为 skillId（当前仅支持 platform-global skills）
   * - 幂等 bind 到 CEO agent，触发 agent.skills.changed 事件刷新 ToolRegistry
   * - 异步执行，不阻塞本轮 graph
   */
  private async handleNeededSkills(state: CeoSupervisorState, plan: CeoPlanOutput): Promise<void> {
    const companyId = state.companyId;
    const ceoAgentId = state.ceoAgentId?.trim();
    if (!companyId || !ceoAgentId) return;

    const needed = this.normalizeNeededSkills((plan as any)?.neededSkills);
    if (needed.length === 0) return;

    const actor = this.actor();
    const startedAt = Date.now();
    const tracer = trace.getTracer('foundry-worker-autonomous');
    await tracer.startActiveSpan('ceo.skills.preload', async (span) => {
      span.setAttribute('foundry.company_id', companyId);
      span.setAttribute('foundry.correlation_trace_id', state.traceId);
      span.setAttribute('foundry.agent_id', ceoAgentId);
      span.setAttribute('foundry.needed_skills_count', needed.length);
      span.setAttribute('foundry.supervisor_run_id', state.supervisorRunId || state.traceId);
      try {
        const skillIds = await this.resolveNeededSkillIds(companyId, needed);

        if (!skillIds.length) {
          this.logger.log('CEO neededSkills resolved to empty skillIds', {
            traceId: state.traceId,
            companyId,
            ceoAgentId,
            neededSkills: needed,
            ms: Date.now() - startedAt,
          });
          await this.executionLog.appendForRun(companyId, state.traceId, {
            stepType: 'ceo.skills.preload',
            traceId: state.traceId,
            message: 'resolved_empty',
            outputSnapshot: { ceoAgentId, neededSkills: needed, resolvedSkillIds: [] },
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return;
        }

        const bindRes = await this.rpcInteractive<Record<string, unknown>>('agents.bindSkills', {
          companyId,
          actor,
          id: ceoAgentId,
          data: {
            skillIds,
            source: 'ceo-plan-node',
            isTemporary: true,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        });

        const ms = Date.now() - startedAt;
        if (bindRes?.outcome === 'pending_approval') {
          this.logger.warn('CEO neededSkills preload: bindSkills pending approval', {
            traceId: state.traceId,
            companyId,
            ceoAgentId,
            approvalRequestId: bindRes.approvalRequestId,
            pendingSkillIds: bindRes.pendingSkillIds,
          });
          await this.executionLog.appendForRun(companyId, state.traceId, {
            stepType: 'ceo.skills.preload',
            traceId: state.traceId,
            message: `pending_approval approvalRequestId=${String(bindRes.approvalRequestId ?? '')} ms=${ms}`,
            outputSnapshot: {
              ceoAgentId,
              neededSkills: needed,
              resolvedSkillIds: skillIds,
              bindResult: bindRes,
              ms,
            },
          });
        } else {
          this.logger.log('CEO neededSkills preload triggered (bindSkills)', {
            traceId: state.traceId,
            companyId,
            ceoAgentId,
            neededSkills: needed,
            boundSkillIds: skillIds,
            ms,
          });
          await this.executionLog.appendForRun(companyId, state.traceId, {
            stepType: 'ceo.skills.preload',
            traceId: state.traceId,
            message: `ok skills=${skillIds.length} ms=${ms}`,
            outputSnapshot: { ceoAgentId, neededSkills: needed, resolvedSkillIds: skillIds, ms },
          });
        }
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (e: unknown) {
        const msg = this.formatErrorMessage(e);
        span.setStatus({ code: SpanStatusCode.ERROR, message: msg.slice(0, 240) });
        await this.executionLog.appendForRun(companyId, state.traceId, {
          stepType: 'ceo.skills.preload',
          traceId: state.traceId,
          message: `error: ${msg.slice(0, 300)}`,
          outputSnapshot: { ceoAgentId, neededSkills: needed, error: msg.slice(0, 1500) },
        });
        throw e;
      } finally {
        span.end();
      }
    });
  }

  private async resolveNeededSkillIds(companyId: string, needed: string[]): Promise<string[]> {
    const actor = this.actor();
    const direct = await this.rpcInteractive<string[]>('skills.resolveGlobalSkillIdsByNames', {
      names: needed,
    });
    if (direct.length) return direct;

    // Fallback: model may output display-ish names; try a lightweight search in visible skills.
    // QuerySkillsDto.search is tenant-scoped by default; companyOnly=false keeps global visible.
    const resolved: string[] = [];
    for (const term of needed) {
      try {
        const res = await this.rpcInteractive<{
          items?: { id: string; name?: string }[];
        }>('skills.findAll', {
          companyId,
          actor,
          search: term,
          page: 1,
          pageSize: 20,
          companyOnly: false,
        });
        const items = Array.isArray(res?.items) ? res.items : [];
        const exact =
          items.find((s) => (s?.name ?? '').trim().toLowerCase() === term.trim().toLowerCase()) ??
          items[0];
        if (exact?.id) resolved.push(exact.id);
      } catch {
        // ignore per-term fallback errors; overall preload remains best-effort
      }
    }
    return [...new Set(resolved)];
  }

  private async prewarmCeoTools(initial: CeoSupervisorState): Promise<void> {
    const companyId = initial.companyId;
    const actor = this.actor();
    const startedAt = Date.now();

    const now = Date.now();
    const cached = this.ceoAgentIdCache.get(companyId);
    let ceoAgentId = cached && cached.expiresAt > now ? cached.agentId : '';
    if (!ceoAgentId) {
      const res = await this.rpcInteractive<{ items?: { id: string }[] }>('agents.findAll', {
        companyId,
        actor,
        role: 'ceo',
        status: 'active',
        pageSize: 1,
        page: 1,
      });
      ceoAgentId = res?.items?.[0]?.id?.trim() ?? '';
      if (ceoAgentId) {
        this.ceoAgentIdCache.set(companyId, { agentId: ceoAgentId, expiresAt: now + 5 * 60_000 });
      }
    }
    if (!ceoAgentId) return;

    const hydrated = await this.rpcInteractive<{ skills?: SkillToolSnapshot[] }>(
      'agents.effectiveSkillSnapshots',
      {
      companyId,
      actor,
      id: ceoAgentId,
      },
    );
    const skills = Array.isArray(hydrated?.skills) ? hydrated.skills : [];
    this.registry.setAgentTools(companyId, ceoAgentId, skills);

    await this.executionLog.appendForRun(companyId, initial.traceId, {
      stepType: 'ceo.tools.prewarm',
      traceId: initial.traceId,
      message: `skills=${skills.length}`,
      outputSnapshot: { ceoAgentId, skillCount: skills.length },
    });
    this.logger.log('CEO tools prewarmed', {
      traceId: initial.traceId,
      companyId,
      ceoAgentId,
      skillCount: skills.length,
      ms: Date.now() - startedAt,
    });
  }

  private async validatePersist(state: CeoSupervisorState): Promise<Partial<CeoSupervisorState>> {
    if (this.readEarlyExitSnapshot(state).earlyExit) {
      return {
        createdTaskIdsJson: '[]',
        persistErrorsJson: '[]',
      };
    }
    const plan = this.parseCeoPlanWithGuard(state.planResultJson, state.traceId, 'validatePersist');

    let parsedCtx: Record<string, unknown> = {};
    try {
      parsedCtx = JSON.parse(state.contextBundle || '{}') as Record<string, unknown>;
    } catch {
      parsedCtx = {};
    }

    const orgTree = (parsedCtx.organizationTree ?? []) as OrgTreeNodeShape[];
    const validNodeIds = collectOrganizationNodeIds(orgTree);

    const actor = this.actor();
    let mainRoomId = '';
    try {
      const room = await this.rpc<{ id?: string } | null>(
        'collaboration.rooms.findMain',
        {
          companyId: state.companyId,
          actor,
        },
        state.traceId,
      );
      mainRoomId = room?.id ?? '';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('findMain room failed (pre validatePersist)', {
        companyId: state.companyId,
        error: msg,
      });
    }
    const dynamicsRoomId = state.collaborationRoomId?.trim() || mainRoomId;
    const created: string[] = [];
    const errors: { title?: string; error: string }[] = [];

    for (const [idx, t] of plan.tasks.entries()) {
      try {
        if (t.organizationNodeId && !validNodeIds.has(t.organizationNodeId)) {
          errors.push({ title: t.title, error: 'organizationNodeId 不在组织树中' });
          continue;
        }

        if (t.assigneeAgentId) {
          try {
            const agent = await this.rpc<Record<string, unknown>>(
              'agents.findOne',
              {
                companyId: state.companyId,
                actor,
                id: t.assigneeAgentId,
              },
              state.traceId,
            );
            if (t.organizationNodeId && agent.organizationNodeId && agent.organizationNodeId !== t.organizationNodeId) {
              errors.push({
                title: t.title,
                error: 'Agent 与组织节点不匹配',
              });
              continue;
            }
          } catch (e: unknown) {
            errors.push({
              title: t.title,
              error: e instanceof Error ? e.message : String(e),
            });
            continue;
          }
        }

        let assigneeType: 'unassigned' | 'agent' | 'organization_node' = 'unassigned';
        let assigneeId: string | null = null;
        if (t.assigneeAgentId) {
          assigneeType = 'agent';
          assigneeId = t.assigneeAgentId;
        } else if (t.organizationNodeId) {
          assigneeType = 'organization_node';
          assigneeId = t.organizationNodeId;
        }

        let createdTask: Record<string, unknown>;
        let delegatedByCeo = false;
        const idemKey = this.buildTaskIdempotencyKey(
          state.traceId,
          t.title || '',
          t.description || '',
          idx,
        );
        const allowCreate = this.resilience.markIfNew(
          `autonomous:task:create:${state.companyId}:${idemKey}`,
          AutonomousOrchestratorService.TASK_IDEMPOTENCY_TTL_MS,
        );
        if (!allowCreate) {
          this.logger.warn('autonomous-trace | validatePersist.duplicate_task_blocked', {
            traceId: state.traceId,
            companyId: state.companyId,
            idempotencyKey: idemKey,
            title: this.clip(t.title || '', 120),
          });
          continue;
        }
        if (t.assigneeAgentId && state.ceoAgentId) {
          try {
            const target = await this.rpc<Record<string, unknown>>(
              'agents.findOne',
              {
                companyId: state.companyId,
                actor,
                id: t.assigneeAgentId,
              },
              state.traceId,
            );
            if (target?.role === 'director') {
              createdTask = await this.rpc<Record<string, unknown>>(
                'tasks.ceo.delegateToDirector',
                {
                  companyId: state.companyId,
                  actor,
                  data: {
                    ceoAgentId: state.ceoAgentId,
                    directorAgentId: t.assigneeAgentId,
                    title: t.title,
                    description: t.description,
                    priority: t.priority ?? 'normal',
                    requiresHumanApproval: plan.requiresHumanApproval,
                    traceId: state.traceId,
                    source: 'ceo-strategic-breakdown',
                    idempotencyKey: idemKey,
                  },
                },
                state.traceId,
              );
              delegatedByCeo = true;
            } else {
              createdTask = await this.rpc<Record<string, unknown>>(
                'tasks.create',
                {
                  companyId: state.companyId,
                  actor,
                  source: 'autonomous',
                  data: {
                    title: t.title,
                    description: t.description,
                    priority: t.priority ?? 'normal',
                    assigneeType,
                    assigneeId,
                    requiresHumanApproval: plan.requiresHumanApproval,
                    metadata: {
                      ceoTraceId: state.traceId,
                      idempotencyKey: idemKey,
                      organizationNodeId: t.organizationNodeId,
                      ...(dynamicsRoomId ? { roomId: dynamicsRoomId } : {}),
                    },
                  },
                },
                state.traceId,
              );
            }
          } catch {
            createdTask = await this.rpc<Record<string, unknown>>(
              'tasks.create',
              {
                companyId: state.companyId,
                actor,
                source: 'autonomous',
                data: {
                  title: t.title,
                  description: t.description,
                  priority: t.priority ?? 'normal',
                  assigneeType,
                  assigneeId,
                  requiresHumanApproval: plan.requiresHumanApproval,
                  metadata: {
                    ceoTraceId: state.traceId,
                    idempotencyKey: idemKey,
                    organizationNodeId: t.organizationNodeId,
                    ...(dynamicsRoomId ? { roomId: dynamicsRoomId } : {}),
                  },
                },
              },
              state.traceId,
            );
          }
        } else {
          createdTask = await this.rpc<Record<string, unknown>>(
            'tasks.create',
            {
              companyId: state.companyId,
              actor,
              source: 'autonomous',
              data: {
                title: t.title,
                description: t.description,
                priority: t.priority ?? 'normal',
                assigneeType,
                assigneeId,
                requiresHumanApproval: plan.requiresHumanApproval,
                metadata: {
                  ceoTraceId: state.traceId,
                  idempotencyKey: idemKey,
                  organizationNodeId: t.organizationNodeId,
                  ...(dynamicsRoomId ? { roomId: dynamicsRoomId } : {}),
                },
              },
            },
            state.traceId,
          );
        }
        if (delegatedByCeo) {
          this.logger.log('CEO delegated task to director via facade', {
            companyId: state.companyId,
            traceId: state.traceId,
            directorAgentId: t.assigneeAgentId,
            title: t.title,
          });
        }
        const id = createdTask.id as string;
        created.push(id);
      } catch (e: unknown) {
        errors.push({
          title: t.title,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // 2) CEO 拆解后，将相关部门/执行 Agent 拉入协作群（@CEO 触发时用当前群，否则主群）
    //    - organizationNodeId：走 subtree 拉入部门内所有可加入的 active Agent
    //    - assigneeAgentId（且无 organizationNodeId）：兜底直接拉入指定 Agent
    try {
      if (dynamicsRoomId) {
        const orgNodeIds = [...new Set(plan.tasks.map((x) => x.organizationNodeId).filter(Boolean))] as string[];
        // Always include explicit assignees as a safety-net:
        // org-node pull may fail due permissions/policy, but direct assignee join should still proceed.
        const explicitAgentIds = [
          ...new Set(
            plan.tasks
              .filter((x) => x.assigneeAgentId)
              .map((x) => x.assigneeAgentId as string),
          ),
        ];

        const isCollabMentionRun = state.triggerSource === 'collaboration_mention';
        if (!isCollabMentionRun) {
          for (const nodeId of orgNodeIds) {
            try {
              await this.rpc(
                'collaboration.members.addFromOrganizationNode',
                {
                  companyId: state.companyId,
                  actor,
                  roomId: dynamicsRoomId,
                  organizationNodeId: nodeId,
                  scope: 'subtree',
                },
                state.traceId,
              );
            } catch (e: unknown) {
              const msg = this.formatErrorMessage(e);
              this.logger.warn('pull org members into collaboration room failed', {
                companyId: state.companyId,
                roomId: dynamicsRoomId,
                organizationNodeId: nodeId,
                error: msg,
              });
            }
          }
        }

        if (explicitAgentIds.length) {
          await this.rpc(
            'collaboration.members.add',
            {
              companyId: state.companyId,
              actor,
              roomId: dynamicsRoomId,
              members: explicitAgentIds.map((agentId) => ({
                memberType: 'agent',
                memberId: agentId,
              })),
            },
            state.traceId,
          );
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('pull agents into main room failed (post-validatePersist)', {
        companyId: state.companyId,
        error: msg,
      });
    }

    return {
      createdTaskIdsJson: JSON.stringify(created),
      persistErrorsJson: JSON.stringify(errors),
    };
  }

  private async summarize(state: CeoSupervisorState): Promise<Partial<CeoSupervisorState>> {
    const plan = this.parseCeoPlanWithGuard(state.planResultJson, state.traceId, 'summarize');
    if (this.readEarlyExitSnapshot(state).earlyExit && (state.reportDraft ?? '').trim()) {
      return { reportDraft: state.reportDraft!.trim() };
    }
    let created: string[] = [];
    let persistErrors: { title?: string; error: string }[] = [];
    try {
      created = JSON.parse(state.createdTaskIdsJson || '[]') as string[];
    } catch {
      created = [];
    }
    try {
      persistErrors = JSON.parse(state.persistErrorsJson || '[]') as {
        title?: string;
        error: string;
      }[];
    } catch {
      persistErrors = [];
    }

    const header =
      state.runKind === 'heartbeat'
        ? `[Heartbeat ${state.tickAt}] trace=${state.traceId}`
        : `[战略拆解] ${state.goal?.slice(0, 120) ?? ''}`;

    let planMeta: Record<string, unknown> = {};
    try {
      planMeta = JSON.parse(state.llmMetaJson || '{}') as Record<string, unknown>;
    } catch {
      planMeta = {};
    }
    const planSoftDegraded = planMeta.planSoftDegraded === true && state.runKind === 'breakdown';

    let hierMeta = '';
    try {
      const hm = JSON.parse(state.hierarchicalMetaJson || '{}') as {
        autoAssigned?: unknown[];
        errors?: unknown[];
      };
      if (hm?.autoAssigned?.length || hm?.errors?.length) {
        hierMeta = `--- 层级展开 ---\n${JSON.stringify(hm)}`;
      }
    } catch {
      hierMeta = '';
    }

    const lines = planSoftDegraded
      ? [
          '[战略拆解]',
          '本轮深度规划暂时不可用，我已切换为轻量对话模式继续协助。',
          plan.summary ? `摘要：${plan.summary}` : null,
          plan.requiresHumanApproval ? '当前需要人工审批后再继续自动拆解。' : null,
        ].filter(Boolean) as string[]
      : [
          header,
          `公司: ${state.companyId}`,
          `supervisorRun: ${state.supervisorRunId || state.traceId}`,
          `触发: ${state.triggerSource}${state.triggerRef ? ` ref=${state.triggerRef}` : ''}`,
          state.rootTaskId ? `根任务: ${state.rootTaskId}` : null,
          state.skipPlanReason ? `跳过规划: ${state.skipPlanReason}` : null,
          hierMeta || null,
          '--- CEO 摘要 ---',
          plan.summary,
          '--- 新任务建议（已持久化）---',
          created.length ? created.join(', ') : '(无)',
          '--- 持久化错误 ---',
          persistErrors.length ? JSON.stringify(persistErrors) : '(无)',
          plan.requiresHumanApproval ? `需要人工审批: ${plan.approvalReason ?? ''}` : null,
        ].filter(Boolean) as string[];

    return {
      reportDraft: lines.join('\n'),
    };
  }

  private async notify(state: CeoSupervisorState): Promise<Partial<CeoSupervisorState>> {
    const actor = this.actor();
    const maxChars = this.config.getCeoReportMaxChars();
    const report = (state.reportDraft ?? '').slice(0, maxChars);

    let mainRoomId = '';
    try {
      const room = await this.rpc<{ id: string } | null>(
        'collaboration.rooms.findMain',
        {
          companyId: state.companyId,
          actor,
        },
        state.traceId,
      );
      mainRoomId = room?.id ?? '';
    } catch (e: unknown) {
      this.logger.warn('findMain room failed', {
        companyId: state.companyId,
        message: this.formatErrorMessage(e),
      });
    }

    const collabRoom = state.collaborationRoomId?.trim() ?? '';
    const postRoomId = collabRoom || mainRoomId;
    const ceoId = state.ceoAgentId?.trim() ?? '';

    const shouldPostToRoom = state.triggerSource !== 'schedule';

    if (postRoomId && ceoId && shouldPostToRoom) {
      try {
        if (report.trim().length) {
          const msgSource =
            state.triggerSource === 'collaboration_mention' ? 'ceo_collaboration' : 'ceo_heartbeat';
          const heartbeatCorrelation: CollaborationHeartbeatCorrelationPayload | undefined =
            this.config.isCollabHeartbeatCorrelationEnabled()
              ? {
                  heartbeatRunId: state.traceId,
                  tickAt: state.tickAt,
                  triggerSource: state.triggerSource,
                  runKind: state.runKind,
                  mainRoomId: mainRoomId || null,
                  collaborationSurfaceRoomId: postRoomId || null,
                }
              : undefined;
          // 先模拟“流式块”输出（stream_chunk -> WS message:chunk）
          const streamId = `ceo_report:${state.traceId}`;
          const chunkSize = 200;
          const chunks: string[] = [];
          for (let i = 0; i < report.length; i += chunkSize) {
            const chunk = report.slice(i, i + chunkSize);
            if (chunk.trim().length) chunks.push(chunk);
          }

          for (let i = 0; i < chunks.length; i += 1) {
            await this.rpc(
              'collaboration.messages.appendAgent',
              {
                companyId: state.companyId,
                actor,
                roomId: postRoomId,
                agentId: ceoId,
                content: ConversationOutputSanitizerService.toVisibleLayer(chunks[i]!),
                messageType: 'stream_chunk',
                metadata: {
                  traceId: state.traceId,
                  source: msgSource,
                  streamId,
                  chunkIndex: i,
                  chunkCount: chunks.length,
                  ...(heartbeatCorrelation ? { heartbeatCorrelation } : {}),
                },
              },
              state.traceId,
            );
          }

          // 再发最终系统消息，供用户阅读与 summary/memory 落库（stream_chunk 会在总结/记忆侧被跳过）
          await this.rpc(
            'collaboration.messages.appendAgent',
            {
              companyId: state.companyId,
              actor,
              roomId: postRoomId,
              agentId: ceoId,
              content: ConversationOutputSanitizerService.toVisibleLayer(report),
              messageType: 'system',
              metadata: {
                traceId: state.traceId,
                source: msgSource,
                ...(heartbeatCorrelation ? { heartbeatCorrelation } : {}),
              },
            },
            state.traceId,
          );
        }
      } catch (e: unknown) {
        this.logger.warn('collaboration.messages.appendAgent failed', {
          message: this.formatErrorMessage(e),
        });
      }
    } else if (postRoomId && ceoId && !shouldPostToRoom) {
      this.logger.debug('skip collaboration notify for scheduled heartbeat', {
        companyId: state.companyId,
        traceId: state.traceId,
      });
    } else if (postRoomId && !ceoId) {
      this.logger.warn('skip collaboration notify: missing ceoAgentId', {
        companyId: state.companyId,
        postRoomId,
        traceId: state.traceId,
      });
    }

    try {
      const target = this.config.getAutonomousMemoryStoreMode();
      const namespace =
        target === 'session' && postRoomId
          ? `session:${postRoomId}`
          : 'ceo_autonomous';
      if (this.config.isAutonomousMemoryAdapterEnabled()) {
        await this.memoryPort.store({
          companyId: state.companyId,
          actor,
          data: {
            namespace,
            collectionLabel: `heartbeat:${state.tickAt}`,
            content: report,
            sourceType: 'summary',
            metadata: {
              traceId: state.traceId,
              triggerSource: state.triggerSource,
              ...(this.config.isCollabHeartbeatCorrelationEnabled()
                ? {
                    heartbeatCorrelation: {
                      heartbeatRunId: state.traceId,
                      tickAt: state.tickAt,
                      triggerSource: state.triggerSource,
                      runKind: state.runKind,
                      mainRoomId: mainRoomId || null,
                      collaborationSurfaceRoomId: postRoomId || null,
                    },
                  }
                : {}),
            },
            /** RpcMemoryAdapter 发送前剥离，不进入 API DTO */
            pipelineTraceId: state.traceId,
          },
        });
      } else {
        await this.rpc(
          'memory.entries.store',
          {
            companyId: state.companyId,
            actor,
            data: {
              namespace,
              collectionLabel: `heartbeat:${state.tickAt}`,
              content: report,
              sourceType: 'summary',
              metadata: {
                traceId: state.traceId,
                triggerSource: state.triggerSource,
                ...(this.config.isCollabHeartbeatCorrelationEnabled()
                  ? {
                      heartbeatCorrelation: {
                        heartbeatRunId: state.traceId,
                        tickAt: state.tickAt,
                        triggerSource: state.triggerSource,
                        runKind: state.runKind,
                        mainRoomId: mainRoomId || null,
                        collaborationSurfaceRoomId: postRoomId || null,
                      },
                    }
                  : {}),
              },
            },
          },
          state.traceId,
        );
      }
    } catch (e: unknown) {
      this.logger.warn('memory.entries.store failed', {
        message: this.formatErrorMessage(e),
      });
    }

    const plan = this.parseCeoPlanWithGuard(state.planResultJson, state.traceId, 'notify');

    if (plan.requiresHumanApproval && postRoomId && state.ceoAgentId) {
      const approvalId = randomUUID();

      // HITL 最佳实践：将 approvalId 以及最终决策落到任务 metadata，
      // 让任何 Worker 实例都能基于 DB 状态恢复执行（避免进程内存 gate 丢失/顺序错乱）。
      let createdTaskIds: string[] = [];
      try {
        createdTaskIds = JSON.parse(state.createdTaskIdsJson || '[]') as string[];
      } catch {
        createdTaskIds = [];
      }

      if (createdTaskIds.length) {
        try {
          for (const taskId of createdTaskIds) {
            await this.rpc(
              'tasks.update',
              {
                companyId: state.companyId,
                actor,
                id: taskId,
                data: {
                  metadata: {
                    ceoApprovalId: approvalId,
                    ceoApprovalDecision: 'pending',
                  },
                },
              },
              state.traceId,
            );
          }
        } catch (e: unknown) {
          this.logger.warn('persist ceoApprovalId to tasks failed', {
            companyId: state.companyId,
            approvalId,
            traceId: state.traceId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const evt: AutonomousCeoApprovalRequiredEvent = {
        eventId: randomUUID(),
        eventType: 'autonomous.ceo.approval.required',
        aggregateId: state.companyId,
        aggregateType: 'company',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: state.companyId,
        data: {
          companyId: state.companyId,
          roomId: postRoomId,
          agentId: state.ceoAgentId,
          reason: plan.approvalReason ?? plan.summary.slice(0, 500),
          traceId: state.traceId,
          approvalId,
          metadata: { reportPreview: report.slice(0, 1000) },
        },
      };
      await this.messaging.publish(evt, {
        routingKey: 'autonomous.ceo.approval.required',
        persistent: true,
      });
    }

    return { mainRoomId: postRoomId };
  }
}
