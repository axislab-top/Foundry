import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';
import {
  buildHierarchicalHeartbeatGraph,
  ToolRegistry,
  type CeoSupervisorState,
} from '@service/ai';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { TenantContextService } from '@service/tenant';
import { MessagingService } from '@service/messaging';
import type {
  AutonomousCeoApprovalRequiredEvent,
  AutonomousCeoHeartbeatCompletedEvent,
  BillingConsumptionRequestedEvent,
  SkillToolSnapshot,
  TaskBreakdownRequestedEvent,
} from '@contracts/events';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { ZodIssue, ZodSchema } from 'zod';
import { ConfigService } from '../../common/config/config.service.js';
import { CeoChatModelFactory } from './ceo-chat-model.factory.js';
import {
  ceoPlanIntentSchema,
  ceoPlanSchema,
  ceoPlanTasksExpansionSchema,
  type CeoPlanOutput,
} from './ceo-plan.schema.js';
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

export interface RunHeartbeatOptions {
  triggerSource?: 'schedule' | 'task_completed' | 'budget_warning' | 'collaboration_mention';
  triggerRef?: string;
  traceId?: string;
  /** 协作消息触发的房间：notify 优先发往此房间 */
  collaborationRoomId?: string;
}

/**
 * LangChain 对「非 gpt-3 / 非 gpt-4-* / 非 gpt-4」模型名默认走 response_format=json_schema。
 * 智谱 GLM、DeepSeek 等 OpenAI 兼容网关往往不支持或长时间挂起，应使用 json_mode。
 */
function structuredOutputMethodForCeoPlan(modelName: string): 'jsonSchema' | 'jsonMode' {
  const m = (modelName || '').trim().toLowerCase();
  if (
    m.includes('glm-') ||
    m.includes('deepseek') ||
    m.includes('qwen') ||
    m.includes('doubao') ||
    m.includes('moonshot') ||
    m.includes('kimi') ||
    m.includes('ernie') ||
    m.includes('hunyuan')
  ) {
    return 'jsonMode';
  }
  if (m.includes('gpt-4o') || m.includes('gpt-5') || /^o[0-9]/.test(m)) {
    return 'jsonSchema';
  }
  return 'jsonMode';
}

@Injectable()
export class AutonomousOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(AutonomousOrchestratorService.name);
  private graph!: ReturnType<typeof buildHierarchicalHeartbeatGraph>;
  /** 群聊 @CEO 拆解：不用 Postgres checkpoint，避免 invoke 首帧读/写库卡住导致长时间无日志 */
  private graphBreakdown!: ReturnType<typeof buildHierarchicalHeartbeatGraph>;
  private readonly ceoAgentIdCache = new Map<string, { agentId: string; expiresAt: number }>();

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
    @Optional() private readonly monitoring?: MonitoringService,
  ) {}

  onModuleInit(): void {
    const handlers = {
      ingest: (s: CeoSupervisorState) => this.ingest(s),
      plan: (s: CeoSupervisorState) => this.plan(s),
      hierarchicalExpand: (s: CeoSupervisorState) => this.hierarchicalExpand(s),
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

  private actor() {
    return {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
  }

  private baseState(
    companyId: string,
    tickAt: string,
    runKind: 'heartbeat' | 'breakdown',
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
      hierarchicalMetaJson: '{}',
      mainRoomId: '',
      ceoAgentId: '',
      collaborationRoomId: opts?.collaborationRoomId?.trim() ?? '',
      reportDraft: '',
    };
  }

  async runHeartbeat(
    companyId: string,
    tickAt: string,
    opts?: RunHeartbeatOptions,
  ): Promise<void> {
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      await this.invokeGraph(this.baseState(companyId, tickAt, 'heartbeat', '', undefined, opts));
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
        }),
      );
    });
  }

  private async invokeGraph(initial: CeoSupervisorState): Promise<void> {
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
            // TODO: P8 必须迁移到 runner.execute RPC（当前仍为临时路径：LangGraph/ToolRegistry 内可能触发内置执行）
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
      const taskPriority =
        state.triggerSource === 'collaboration_mention'
          ? 'high'
          : state.triggerSource === 'budget_warning'
            ? 'low'
            : 'normal';
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

    return {
      contextBundle: JSON.stringify(bundle),
      ceoAgentId,
    };
  }

  private async plan(state: CeoSupervisorState): Promise<Partial<CeoSupervisorState>> {
    this.logger.log('CEO plan node entered', {
      companyId: state.companyId,
      traceId: state.traceId,
      runKind: state.runKind,
      triggerSource: state.triggerSource,
    });

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
    const modelName = modelRouter?.modelName ?? 'gpt-4o-mini';

    const ceoAgents = parsed.ceoAgents as { items?: Record<string, unknown>[] } | undefined;
    const ceo = ceoAgents?.items?.[0];
    const systemPrompt =
      (ceo?.systemPrompt as string | undefined)?.slice(0, 8000) ||
      '你是公司 CEO，负责根据上下文提出可执行的子任务，并遵守组织结构。';

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

    let llmInvokeStartedAt = 0;
    try {
      const fixedLlmKeyId =
        typeof ceo?.llmKeyId === 'string' && ceo.llmKeyId.trim() ? ceo.llmKeyId.trim() : undefined;

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
      const structuredIntent = (model as { withStructuredOutput: (s: unknown, c?: object) => any }).withStructuredOutput(
        ceoPlanIntentSchema,
        structuredOpts,
      );
      const structuredTasks = (model as { withStructuredOutput: (s: unknown, c?: object) => any }).withStructuredOutput(
        ceoPlanTasksExpansionSchema,
        structuredOpts,
      );

      const neededSkillsSpec =
        '输出字段约束：`neededSkills` 为可选数组（skill slug，kebab-case），仅在确有必要时填写；最多 5 个。';
      const strictJsonRule = [
        'You MUST respond with NOTHING but a single valid JSON object matching the schema.',
        'No markdown, no explanations, no code blocks, no leading/trailing text.',
      ].join('\n');
      const intentSchemaHint =
        '{"summary":"string(10-800)","nextStep":"generate_tasks|summary_only","requiresHumanApproval":"boolean","approvalReason?":"string","neededSkills?":"string[]<=5(kebab-case)"}';
      const taskSchemaHint =
        '{"tasks":[{"title":"string","description?":"string","organizationNodeId?":"uuid","assigneeAgentId?":"uuid","priority?":"low|normal|high|urgent"}]<=20}';
      const systemFull = `${systemPrompt}\n\n${strictJsonRule}\n\nIntent Schema:\n${intentSchemaHint}\n\n${neededSkillsSpec}\n\n组织树（仅允许将任务关联到以下节点 id）：\n${orgPrompt}\n\n最近公司上下文（记忆 + 教训，可能已截断）:\n${recentContext || '(无)'}\n\n预算利用率: ${modelRouter?.utilization ?? 'n/a'}；模型降级: ${modelRouter?.degraded ? '是' : '否'}。\n\nIntent Schema(end):\n${intentSchemaHint}`;
      const systemForLlm = isGlmBreakdown
        ? `${systemPrompt.slice(0, 2200)}\n\n${strictJsonRule}\n\nIntent Schema:\n${intentSchemaHint}\n\n${neededSkillsSpec}\n\n组织树（节点 id）：\n${orgPrompt.slice(0, 3200)}\n\n预算: ${modelRouter?.utilization ?? 'n/a'}；降级: ${modelRouter?.degraded ? '是' : '否'}。\n\nIntent Schema(end):\n${intentSchemaHint}`
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

        const sysForAttempt =
          useGlmSlimContext && attempt >= 3
            ? `${systemPrompt.slice(0, 1400)}\n\n组织树（节点 id，仅可选用以下）：\n${orgPrompt.slice(0, 520)}\n\n预算: ${modelRouter?.utilization ?? 'n/a'}`
            : systemForLlm;

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
            systemPreview: this.clip(sysForAttempt, 600),
            userPreview: this.clip(userContent, 900),
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
        const fallbackResult = ceoPlanSchema.parse({
          summary:
            '本轮 CEO 心跳规划输出格式异常，已切换为安全兜底方案。建议人工补充本周期的关键战略目标与优先级，然后重新触发 Heartbeat。',
          tasks: [
            {
              title: '补充本周期的公司关键目标与优先级（兜底占位任务）',
              description:
                '大模型规划失败，系统自动生成的默认任务。请由公司负责人在协作群内补充：1) 本周期最重要的 1-3 个业务目标；2) 关键风险与约束；3) 希望 CEO Agent 聚焦的方向。',
              priority: 'high',
            },
          ],
          neededSkills: [],
          requiresHumanApproval: true,
          approvalReason: '规划输出异常，需人工确认默认任务与后续战略方向。',
        });
        this.logger.warn('CEO plan intent unrecoverable; fallback used', {
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
        return {
          skipPlanReason: 'intent_structured_output_failed',
          planResultJson: JSON.stringify(fallbackResult),
          llmMetaJson: JSON.stringify({ error: true, stage: 'intent' }),
        };
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
        const taskSystem = `${systemPrompt}\n\n${strictJsonRule}\n\nTask Schema:\n${taskSchemaHint}\n\n组织树（仅允许将任务关联到以下节点 id）：\n${orgPrompt}\n\nTask Schema(end):\n${taskSchemaHint}`;
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
        approvalReason: safeIntent.approvalReason,
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

      return {
        planResultJson: JSON.stringify(result),
        llmMetaJson: JSON.stringify(meta),
      };
    } catch (e: unknown) {
      const msg = this.formatErrorMessage(e);
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
      const fallback: CeoPlanOutput = {
        summary: friendlyTimeout,
        tasks: [
          {
            title: '确认 CEO Heartbeat 规划失败原因并补充战略输入（兜底占位任务）',
            description:
              '本轮 CEO 规划调用失败（包含可能的超时/网络问题）。请由负责人在协作群内说明：1) 当前周期的核心业务目标；2) 是否需要立刻重新触发 Heartbeat；3) 是否需要更换模型或缩短上下文。',
            priority: 'high',
          },
        ],
        neededSkills: [],
        requiresHumanApproval: true,
        approvalReason: '规划执行失败，需人工检查并决定后续动作。',
      };
      return {
        skipPlanReason: friendlyTimeout,
        planResultJson: JSON.stringify(fallback),
        llmMetaJson: JSON.stringify({ error: true, rawMessage: msg }),
      };
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
      hierarchicalMetaJson: JSON.stringify(meta),
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

        await this.rpcInteractive('agents.bindSkills', {
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

    for (const t of plan.tasks) {
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

    const lines = [
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

    if (postRoomId && ceoId) {
      try {
        if (report.trim().length) {
          const msgSource =
            state.triggerSource === 'collaboration_mention' ? 'ceo_collaboration' : 'ceo_heartbeat';
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
                content: chunks[i]!,
                messageType: 'stream_chunk',
                metadata: {
                  traceId: state.traceId,
                  source: msgSource,
                  streamId,
                  chunkIndex: i,
                  chunkCount: chunks.length,
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
              content: report,
              messageType: 'system',
              metadata: { traceId: state.traceId, source: msgSource },
            },
            state.traceId,
          );
        }
      } catch (e: unknown) {
        this.logger.warn('collaboration.messages.appendAgent failed', {
          message: this.formatErrorMessage(e),
        });
      }
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
            metadata: { traceId: state.traceId, triggerSource: state.triggerSource },
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
              metadata: { traceId: state.traceId, triggerSource: state.triggerSource },
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
